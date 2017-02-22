var he = require('he'), // for encoding/decoding special HTML characters
	request = require('request');

require('dotenv').config();

// import Backend from './backend';

export default class GPlus {
	constructor() {
		this.userId = process.env.GPLUS_USER_ID;
		this.APIKey = process.env.GPLUS_API_KEY;

		this.cardCategories = [
			'ongoing',
			'historical',
			'critique',
			'reform',
			'thinking',
			'person'
		];

		// Placeholder static card author
		this.gcardAuthor = {
			userId: 0,
			username: 'Chris Reeve',
			avatar: 'https://lh3.googleusercontent.com/-7pSD5TEGt4g/AAAAAAAAAAI/AAAAAAAAACI/Cqefb4i8T3E/photo.jpg?sz=50',
			email: 'paradigmsareconstructed@gmail.com',
			bio: '(MC) Master of Controversies',
			lastTimeOnline: '1985-04-12T23:20:50.52Z'			
		};
	}

	init() {
		// format as '&pageToken=Cg0Q2ZKay9WG0QIgACgBEhQIABCwmrv244XRAhj4tLOxgs3QAhgCIBQozLeC4OPFzoP9AQ'
		this.nextPageToken = '';
		this.collection = [];
		this.more = true;
		this.titlesAdded = new Set(); // To avoid dupes
	}

	// Assumes that this.nextPageToken has already been updated from prior response
	constructRequest() {
		this.nextRequest = 'https://www.googleapis.com/plus/v1/people/' +
			this.userId +
			'/activities/public?key=' +
			this.APIKey +
			this.nextPageToken;

		console.log('\n' + this.nextRequest);

		return this.nextRequest;
	}

	// Extracts the card summary from the controversy card HTML
	getCardSummary(gcardHTML) {
		// Extract summary from first bolded item in content
		let summaryStart = '<b>',
			summaryEnd = '</b>',
			regExpression = new RegExp('(?:' + summaryStart + ')(.*?)(?:' + summaryEnd + ')');

		let regExResult = regExpression.exec(gcardHTML);

		if (regExResult && regExResult.length > 1) {

			// Check for : between <b></b>, but allow for the possibility that there is no
			// colon separating card title and summary
			let cardSummary = regExResult[1].indexOf(':') === -1 ?
				regExResult[1] :
				regExResult[1].split(': ')[1];

			// Convert any special HTML characters after removing the card title
			return he.decode(cardSummary);
		} else {
			throw "Error generating summary, abort";
		}
	}

	// Determine the category by checking for a hashtag at the end of the card's HTML
	getCategory(gcardHTML) {
		let hashtagIndex = gcardHTML.lastIndexOf('#'),
			hashtagString = gcardHTML.substring(hashtagIndex);

		for (var category of this.cardCategories) {
			if (hashtagString.indexOf(category) !== -1) {
				return category;
			}
		}

		return 'unknown';
	}

	isAnnouncementCard(gcardHTML) {
		return gcardHTML.indexOf('<b>~') === 0;
	}

	hasImageAttachment(gcardObject) {
		return gcardObject['attachments'][0]['fullImage'];
	}

	titleIsSummary(cardTitle) {
		return cardTitle.indexOf(': ') === -1;
	}

	getCardName(cardTitle) {
		return cardTitle.split(':')[0];
	}

	// Saves an individual Google Plus controversy card to GPlus object
	saveCard(gcard) {
		try {
			let gcardObject = gcard['object'],
				gcardHTML = gcardObject['content'];

			let gcardSummary = this.getCardSummary(gcardHTML);

			// If the card HTML begins with a bolded tilde or it has no attachment,
			// then do not add it to the backend
			if (!this.isAnnouncementCard(gcardHTML) &&
				this.hasImageAttachment(gcardObject)) {

				// Controversies of Science controversy cards only have one attached image
				let gcardAttachment = gcardObject['attachments'][0],
					gcardFullImageURL = gcardAttachment['fullImage']['url'],
					gcardThumbnailImageURL = gcardAttachment['image']['url'],
					gcardPublishDate = gcard['published'],
					gcardUpdateDate = gcard['updated'];

				// allow for possibility that there is no colon separating title from summary,
				// in that case title and summary are the same
				let gName = this.titleIsSummary(gcard['title']) ?
					gcardSummary :
					this.getCardName(gcard['title']);

				let category = this.getCategory(gcardHTML);

				console.log('category: ' + category);

				let metaCard = {
					author: this.gcardAuthor,
					name: gName,
					summary: gcardSummary,
					url: gcardFullImageURL,
					thumbnail: gcardThumbnailImageURL,
					publishDate: gcardPublishDate,
					updateDate: gcardUpdateDate,
					category: category
				};

				if (!this.titlesAdded.has(gName)) {
					this.collection.push(metaCard);
					this.titlesAdded.add(gName);
				}

				// Stop at the last card in the Controversies of Science Collection
				if (gName == 'Gerald Pollack') {
					this.more = false;
				}
			}
		} catch(e) {
			return; // Do nothing if the JSON is not the correct format
		}
	}

	// Saves a batch of 20 Google Plus controversy cards to the GPlus object
	saveCards(gcards) {
		for (var gcard of gcards['items']) {
			if (this.more) {
				this.saveCard(gcard);
			}
		}
	}

	// Scrapes a batch of 20 Google Plus controversy cards
	getNextCards(resolve, reject) {
		request(this.constructRequest(), (error, response, body) => {
			if (!error && response.statusCode == 200) {
				let gplusJSON = JSON.parse(body),
					nextPageToken = gplusJSON['nextPageToken'] || null;

				this.saveCards(gplusJSON);

				this.nextPageToken = nextPageToken ?
					'&pageToken=' + nextPageToken :
					null;

				return resolve(this.collection);
			} else {
				return reject(error);
			}
		});
	}

	getNames(collection) {
		return collection.map(card => card['name']);
	}

	// Return only the new cards which should be added to the collection
	// calculateNewCardTitles(backendCollection, scrapedCollection) {
	// 	console.log('\nCalculating new card titles ...');

	// 	let backendNames = this.getNames(backendCollection),
	// 		scrapedNames = this.getNames(scrapedCollection);

	// 	return scrapedNames.filter(name => !backendNames.find((name) => {return name;}));
	// }

	getCardsByName(collection, cardNames) {
		var newCards = [];

		console.log('\nGetting cards by name ...\n');

		for (var card of collection) {
			let name = card['name'];
			if (cardNames.find((name) => {return name;})) {
				newCards.push(card);
			}
		}

		return newCards;
	}

	// Identifies cards that are not already in the Google Plus card collection, and
	// adds them to the collection
	// updateBackend(scrapedCollection, req, res) {
	// 	let backend = new Backend();

	// 	var backendPromise = new Promise(
	// 		(resolve, reject) => {
	// 			backend.getMetaCards(resolve, reject);
	// 		}
	// 	)

	// 	backendPromise.then(
	// 		(backendCollection) => {
	// 			let newCardNames = this.calculateNewCardTitles(backendCollection, scrapedCollection);

	// 			var addtoPromise = new Promise(
	// 				(resolve, reject) => {
	// 					backend.addtoCollection(this.getCardsByName(scrapedCollection, newCardNames),
	// 						resolve, reject);
	// 				}
	// 			);

	// 			addtoPromise.then(
	// 				() => {
	// 					res.json(newCardNames);
	// 				}
	// 			)
	// 			.catch(
	// 				(reason) => {
	// 					console.log('Error updating backend collection with scrape');
	// 					console.log(reason);
	// 				}
	// 			);
	// 		}
	// 	)
	// 	.catch(
	// 		(reason) => {
	// 			console.log('\nBackend Error:');
	// 			console.log(reason);
	// 		}
	// 	);		
	// }
}
