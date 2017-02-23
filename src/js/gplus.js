'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var he = require('he'),
    // for encoding/decoding special HTML characters
request = require('request');

var GPlus = function () {
	function GPlus() {
		_classCallCheck(this, GPlus);

		this.userId = process.env.GPLUS_USER_ID;
		this.APIKey = process.env.GPLUS_API_KEY;

		this.lastCard = 'Gerald Pollack';

		this.cardCategories = ['ongoing', 'historical', 'critique', 'reform', 'thinking', 'person'];

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

	_createClass(GPlus, [{
		key: 'init',
		value: function init() {
			// format as '&pageToken=Cg0Q2ZKay9WG0QIgACgBEhQIABCwmrv244XRAhj4tLOxgs3QAhgCIBQozLeC4OPFzoP9AQ'
			this.nextPageToken = '';
			this.collection = [];
			this.more = true;
			this.titlesAdded = new Set(); // To avoid dupes
		}

		// Assumes that this.nextPageToken has already been updated from prior response

	}, {
		key: 'constructRequest',
		value: function constructRequest() {
			this.nextRequest = 'https://www.googleapis.com/plus/v1/people/' + this.userId + '/activities/public?key=' + this.APIKey + this.nextPageToken;

			console.log('\n' + this.nextRequest);

			return this.nextRequest;
		}

		// Extracts the card summary from the controversy card HTML

	}, {
		key: 'getCardSummary',
		value: function getCardSummary(gcardHTML) {
			// Extract summary from first bolded item in content
			var summaryStart = '<b>',
			    summaryEnd = '</b>',
			    regExpression = new RegExp('(?:' + summaryStart + ')(.*?)(?:' + summaryEnd + ')');

			var regExResult = regExpression.exec(gcardHTML);

			if (regExResult && regExResult.length > 1) {

				// Check for : between <b></b>, but allow for the possibility that there is no
				// colon separating card title and summary
				var cardSummary = regExResult[1].indexOf(':') === -1 ? regExResult[1] : regExResult[1].split(': ')[1];

				// Convert any special HTML characters after removing the card title
				return he.decode(cardSummary);
			} else {
				throw "Error generating summary, abort";
			}
		}

		// Determine the category by checking for a hashtag at the end of the card's HTML

	}, {
		key: 'getCategory',
		value: function getCategory(gcardHTML) {
			var hashtagIndex = gcardHTML.lastIndexOf('#'),
			    hashtagString = gcardHTML.substring(hashtagIndex);

			var _iteratorNormalCompletion = true;
			var _didIteratorError = false;
			var _iteratorError = undefined;

			try {
				for (var _iterator = this.cardCategories[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
					var category = _step.value;

					if (hashtagString.indexOf(category) !== -1) {
						return category;
					}
				}
			} catch (err) {
				_didIteratorError = true;
				_iteratorError = err;
			} finally {
				try {
					if (!_iteratorNormalCompletion && _iterator.return) {
						_iterator.return();
					}
				} finally {
					if (_didIteratorError) {
						throw _iteratorError;
					}
				}
			}

			return 'unknown';
		}

		// Do not save announcement cards to db -- identify and skip

	}, {
		key: 'isAnnouncementCard',
		value: function isAnnouncementCard(gcardHTML) {
			return gcardHTML.indexOf('<b>~') === 0;
		}
	}, {
		key: 'hasImageAttachment',
		value: function hasImageAttachment(gcardObject) {
			return gcardObject['attachments'][0]['fullImage'];
		}
	}, {
		key: 'titleIsSummary',
		value: function titleIsSummary(cardTitle) {
			return cardTitle.indexOf(': ') === -1;
		}
	}, {
		key: 'getCardName',
		value: function getCardName(cardTitle) {
			return cardTitle.split(':')[0];
		}

		// Saves an individual Google Plus controversy card to GPlus object

	}, {
		key: 'saveCard',
		value: function saveCard(gcard) {
			try {
				var gcardObject = gcard['object'],
				    gcardHTML = gcardObject['content'];

				var gcardSummary = this.getCardSummary(gcardHTML);

				// If the card HTML begins with a bolded tilde or it has no attachment,
				// then do not add it to the backend
				if (!this.isAnnouncementCard(gcardHTML) && this.hasImageAttachment(gcardObject)) {

					// Controversies of Science controversy cards only have one attached image
					var gcardAttachment = gcardObject['attachments'][0],
					    gcardFullImageURL = gcardAttachment['fullImage']['url'],
					    gcardThumbnailImageURL = gcardAttachment['image']['url'],
					    gcardPublishDate = gcard['published'],
					    gcardUpdateDate = gcard['updated'];

					// allow for possibility that there is no colon separating title from summary,
					// in that case title and summary are the same
					var gName = this.titleIsSummary(gcard['title']) ? gcardSummary : this.getCardName(gcard['title']);

					var category = this.getCategory(gcardHTML);

					console.log('category: ' + category);

					var metaCard = {
						author: this.gcardAuthor,
						name: gName,
						summary: gcardSummary,
						url: gcardFullImageURL,
						thumbnail: gcardThumbnailImageURL,
						publishDate: gcardPublishDate,
						updateDate: gcardUpdateDate,
						category: category
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
			} catch (e) {
				return; // Do nothing if the JSON is not the correct format
			}
		}

		// Saves a batch of 20 Google Plus controversy cards to the GPlus object

	}, {
		key: 'saveCards',
		value: function saveCards(gcards) {
			var _iteratorNormalCompletion2 = true;
			var _didIteratorError2 = false;
			var _iteratorError2 = undefined;

			try {
				for (var _iterator2 = gcards['items'][Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
					var gcard = _step2.value;

					if (this.more) {
						this.saveCard(gcard);
					}
				}
			} catch (err) {
				_didIteratorError2 = true;
				_iteratorError2 = err;
			} finally {
				try {
					if (!_iteratorNormalCompletion2 && _iterator2.return) {
						_iterator2.return();
					}
				} finally {
					if (_didIteratorError2) {
						throw _iteratorError2;
					}
				}
			}
		}

		// Scrapes a batch of 20 Google Plus controversy cards

	}, {
		key: 'getNextCards',
		value: function getNextCards(resolve, reject) {
			var _this = this;

			request(this.constructRequest(), function (error, response, body) {
				if (!error && response.statusCode == 200) {
					var gplusJSON = JSON.parse(body),
					    nextPageToken = gplusJSON['nextPageToken'] || null;

					_this.saveCards(gplusJSON);

					_this.nextPageToken = nextPageToken ? '&pageToken=' + nextPageToken : null;

					return resolve(_this.collection);
				} else {
					return reject(error);
				}
			});
		}
	}, {
		key: 'getNames',
		value: function getNames(collection) {
			return collection.map(function (card) {
				return card['name'];
			});
		}
	}, {
		key: 'getCardsByName',
		value: function getCardsByName(collection, cardNames) {
			var newCards = [];

			console.log('\nGetting cards by name ...\n');

			var _iteratorNormalCompletion3 = true;
			var _didIteratorError3 = false;
			var _iteratorError3 = undefined;

			try {
				for (var _iterator3 = collection[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
					var card = _step3.value;

					var name = card['name'];
					if (cardNames.find(function (name) {
						return name;
					})) {
						newCards.push(card);
					}
				}
			} catch (err) {
				_didIteratorError3 = true;
				_iteratorError3 = err;
			} finally {
				try {
					if (!_iteratorNormalCompletion3 && _iterator3.return) {
						_iterator3.return();
					}
				} finally {
					if (_didIteratorError3) {
						throw _iteratorError3;
					}
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

	}, {
		key: 'saveAllCards',
		value: function saveAllCards(scrapedCollection, req, res) {}
	}]);

	return GPlus;
}();

exports.default = GPlus;