var he = require('he'), // for encoding/decoding special HTML characters
	request = require('request');

export default class GPlus {
	constructor() {
		this.userId = process.env.GPLUS_USER_ID;
		this.APIKey = process.env.GPLUS_API_KEY;

		// This is the first card in the Controversies of Science collection,
		// and the point at which we want to stop scraping
		this.lastCard = 'Gerald Pollack';

		this.cardCategories = [
			'ongoing',
			'historical',
			'critique',
			'reform',
			'thinking',
			'person'
		];
	}

	static keysExist() {
		return process.env.GPLUS_USER_ID && process.env.GPLUS_API_KEY;
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

	// Do not save announcement cards to db -- identify and skip
	isAnnouncementCard(gcardHTML) {
		return gcardHTML.indexOf('<b>~') === 0;
	}

	hasImageAttachment(gcardObject) {
		return gcardObject['attachments'][0]['fullImage'];
	}

	titleIsSummary(cardTitle) {
		return cardTitle.includes(': ') === false;
	}

	getCardName(cardTitle) {
		return cardTitle.split(':')[0];
	}

	// Scrapes an individual Google Plus controversy card, saving it to collection
	scrapeCard(gcard) {
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
					name: gName,
					summary: gcardSummary,
					image: gcardFullImageURL,
					thumbnail: gcardThumbnailImageURL,
					url: gcard['url'],
					publishDate: gcardPublishDate,
					updateDate: gcardUpdateDate,
					text: gcardHTML,
					category
				};

				// Avoid adding dupes, like when a card was posted to another collection
				if (!this.titlesAdded.has(gName)) {
					this.collection.push(metaCard);
					this.titlesAdded.add(gName);
				}

				// Stop at the last card in the Controversies of Science Collection
				if (gName == this.lastCard) {
					this.more = false;
				}
			}
		} catch(e) {
			return; // Do nothing if the JSON is not the correct format
		}
	}

	// Scrapes a batch of 20 Google Plus controversy cards
	scrapeCards() {
		return new Promise((resolve, reject) => {
			request(this.constructRequest(), (error, response, body) => {
				if (!error && response.statusCode == 200) {
					let gplusJSON = JSON.parse(body),
						nextPageToken = gplusJSON['nextPageToken'] || null;

					for (var gcard of gplusJSON['items']) {
						if (this.more) {
							this.scrapeCard(gcard);
						}
					}			

					this.nextPageToken = nextPageToken ?
						'&pageToken=' + nextPageToken :
						null;

					resolve(this.collection);
				} else {
					reject({error: error, statusCode: response.statusCode});
				}
			});
		});
	}

	getCollection() {
		return this.collection;
	}
}
