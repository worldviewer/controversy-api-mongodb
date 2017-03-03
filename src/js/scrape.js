'use strict';

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var Db = require('mongodb').Db,
    Server = require('mongodb').Server,
    MongoClient = require('mongodb').MongoClient,
    url = "mongodb://localhost:27017/controversies",
    assert = require('assert'),
    GPlus = require('./gplus').default,
    loadJsonFile = require('load-json-file'),
    METACARDS = 'metacards',
    CARDS = 'cards',
    controversyJSON = 'json/halton-arp.json'; // relative to root

var db = null,
    gplusMetacards = void 0,
    // Controversy card metadata from G+
mongoMetacards = void 0,
    mongoCards = void 0,
    savedCount = void 0,
    shouldScrape = false,
    prototypeCard = void 0;

function create() {
	db = new Db("controversies", new Server('localhost', 27017));
}

function open() {
	return new Promise(function (resolve, reject) {
		MongoClient.connect(url, function (err, db) {
			if (err) {
				reject(err);
			} else {
				resolve(db);
			}
		});
	});
}

function close(db) {
	if (db) {
		db.close();
	}
}

function scrapeCollection(resolve, reject) {
	console.log('\nSynchronizing backend with Google Plus collection ...');

	var gplus = new GPlus();
	gplus.init();

	// Recursive promise chain to deal with API pagination
	// GPlus class handles aggregation of data
	var getPage = function getPage() {
		gplus.scrapeCards().then(function (data) {
			// Send back an array of the card titles which have been added
			if (gplus.nextPageToken && gplus.more) {
				getPage();
			} else {
				console.log('\nScrape Results:\n');
				console.log([].concat(_toConsumableArray(gplus.titlesAdded)));

				resolve(gplus.getCollection());
			}
		}).catch(function (data) {
			console.log("\nAlthough keys do indeed exist to access the G+ API, either the keys are invalid or the request has failed. If you wish to proceed without scraping the G+ API, consider removing the keys from your environment variables.");
			console.log("Status Code: " + data.statusCode);
			console.log("Error: " + data.error);

			reject();
		});
	};

	getPage();
}

create();

open().then(function (database) {
	db = database;
	shouldScrape = GPlus.keysExist();

	return database;
}).then(function (database) {
	return new Promise(function (resolve, reject) {
		resolve(db.collection(METACARDS));
	});
}).then(function (collection) {
	mongoMetacards = collection;

	console.log("\nChecking for Google+ API Keys in local environment.");

	return new Promise(function (resolve, reject) {
		if (!shouldScrape) {
			console.log("\nNo keys found, will not scrape metadata.");

			resolve(null);
		} else {
			console.log("\nScraping G+ Collection.");

			scrapeCollection(resolve, reject);
		}
	});
}).then(function (collection) {
	gplusMetacards = collection;

	return new Promise(function (resolve, reject) {
		resolve(mongoMetacards.count());
	});
}).then(function (count) {
	savedCount = count;

	return new Promise(function (resolve, reject) {
		if (savedCount === 0 && shouldScrape) {

			console.log("\nThere are currently " + savedCount + " metacards in the controversies collection.");
			console.log("\nSaving Scraped data to MongoDB");
			resolve(mongoMetacards.insertMany(gplusMetacards));
		} else if (gplusMetacards && gplusMetacards.length > savedCount) {

			console.log("\nThere are currently " + savedCount + " metacards in the controversies collection.");
			console.log("\nThere are new G+ posts since last scrape.");
			resolve();
		} else if (gplusMetacards && gplusMetacards.length === savedCount) {

			console.log("\nThere are no new G+ posts since last scrape.");
			resolve();
		} else if (!shouldScrape) {

			console.log("\nWill set up backend without G+ metadata.  See README for more information.");
			resolve();
		}
	});
}).then(function () {
	return new Promise(function (resolve, reject) {
		resolve(mongoMetacards.count());
	});
}).then(function (count) {
	savedCount = count;

	console.log("\nThere are now " + savedCount + " metacards in the controversies collection.");
	console.log("\nNow adding prototype card data for Halton Arp controversy card.");
	console.log("(Note that any trailing commas within the JSON may cause an 'Invalid property descriptor' error.)");

	return new Promise(function (resolve, reject) {
		resolve(loadJsonFile(controversyJSON));
	});
}).then(function (json) {
	prototypeCard = json;

	return new Promise(function (resolve, reject) {
		resolve(db.collection(CARDS));
	});
}).then(function (collection) {
	mongoCards = collection;

	return new Promise(function (resolve, reject) {
		resolve(mongoCards.count());
	});
}).then(function (count) {
	return new Promise(function (resolve, reject) {
		if (count === 0) {
			console.log("\nThere is no prototype controversy card to test frontend with.  Adding.");

			resolve(mongoCards.insertOne(prototypeCard));
		} else {
			console.log("\nThe prototype controversy card has already been added.");

			resolve();
		}
	});
}).then(function () {
	console.log("\nAll done and no issues.");

	close(db);
}).catch(function (error) {
	console.log("\nAn error has occurred ...");

	if (error) {
		console.log(error);
	}

	close(db);
});