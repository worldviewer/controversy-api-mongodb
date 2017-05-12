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

		// This is the first card in the Controversies of Science collection,
		// and the point at which we want to stop scraping
		this.lastCard = 'Gerald Pollack';

		this.cardCategories = ['ongoing', 'historical', 'critique', 'reform', 'thinking', 'person'];
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
			return cardTitle.includes(': ') === false;
		}
	}, {
		key: 'getCardName',
		value: function getCardName(cardTitle) {
			return cardTitle.split(':')[0];
		}

		// Scrapes an individual Google Plus controversy card, saving it to collection

	}, {
		key: 'scrapeCard',
		value: function scrapeCard(gcard) {
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
						name: gName,
						summary: gcardSummary,
						image: gcardFullImageURL,
						thumbnail: gcardThumbnailImageURL,
						url: gcard['url'],
						publishDate: gcardPublishDate,
						updateDate: gcardUpdateDate,
						text: gcardHTML,
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

		// Scrapes a batch of 20 Google Plus controversy cards

	}, {
		key: 'scrapeCards',
		value: function scrapeCards() {
			var _this = this;

			return new Promise(function (resolve, reject) {
				request(_this.constructRequest(), function (error, response, body) {
					if (!error && response.statusCode == 200) {
						var gplusJSON = JSON.parse(body),
						    nextPageToken = gplusJSON['nextPageToken'] || null;

						var _iteratorNormalCompletion2 = true;
						var _didIteratorError2 = false;
						var _iteratorError2 = undefined;

						try {
							for (var _iterator2 = gplusJSON['items'][Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
								var gcard = _step2.value;

								if (_this.more) {
									_this.scrapeCard(gcard);
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

						_this.nextPageToken = nextPageToken ? '&pageToken=' + nextPageToken : null;

						resolve(_this.collection);
					} else {
						reject({ error: error, statusCode: response.statusCode });
					}
				});
			});
		}
	}, {
		key: 'getCollection',
		value: function getCollection() {
			return this.collection;
		}
	}], [{
		key: 'keysExist',
		value: function keysExist() {
			return process.env.GPLUS_USER_ID && process.env.GPLUS_API_KEY;
		}
	}]);

	return GPlus;
}();

exports.default = GPlus;