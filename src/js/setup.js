'use strict';

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var Db = require('mongodb').Db,
    Server = require('mongodb').Server,
    MongoClient = require('mongodb').MongoClient,
    url = "mongodb://localhost:27017/controversies",
    assert = require('assert'),
    GPlus = require('./gplus').default,
    METACARDS = 'metacards';

var db = null,
    gplusMetacards = void 0,
    mongoMetacards = void 0,
    savedCount = void 0;

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

function collectionExists(db, collection) {
	return new Promise(function (resolve, reject) {
		db.collection(collection, function (err, db) {
			if (err) {
				console.log(err);
				reject(false);
			} else {
				resolve(true);
			}
		});
	});
}

function scrapeCollection(resolve, reject) {
	console.log('\nSynchronizing backend with Google Plus collection ...');

	var gplus = new GPlus();
	gplus.init();

	// Recursive promise chain to deal with API pagination
	// GPlus class handles aggregation of data
	var getPage = function getPage() {
		gplus.scrapeCards().then(function () {
			// Send back an array of the card titles which have been added
			if (gplus.nextPageToken && gplus.more) {
				getPage();
			} else {
				console.log('\nScrape Results:\n');
				console.log([].concat(_toConsumableArray(gplus.titlesAdded)));

				resolve(gplus.getCollection());
			}
		});
	};

	getPage();
}

create();

open().then(function (database) {
	db = database;
	return database;
}).then(function (database) {
	if (collectionExists(db, METACARDS)) {
		console.log("\nMetacards collection exists");

		return new Promise(function (resolve, reject) {
			resolve(db.collection(METACARDS));
		});
	} else {
		console.log("\nMetacards collection does not exist, will create.");

		return new Promise(function (resolve, reject) {
			resolve(db.createCollection(METACARDS));
		});
	}
}).then(function (collection) {
	mongoMetacards = collection;
}).then(function () {
	console.log("\nScraping G+ Collection.");

	return new Promise(function (resolve, reject) {
		scrapeCollection(resolve, reject);
	});
}).then(function (collection) {
	gplusMetacards = collection;

	return new Promise(function (resolve, reject) {
		resolve(mongoMetacards.count());
	});
}).then(function (count) {
	savedCount = count;

	console.log("\nThere are currently " + savedCount + " cards in the controversies collection.");

	return new Promise(function (resolve, reject) {
		if (savedCount === 0) {
			console.log("\nSaving Scraped data to MongoDB");

			resolve(mongoMetacards.insertMany(gplusMetacards));
		} else if (gplusMetacards.length > savedCount) {
			console.log("\nThere are new G+ posts since last scrape.");
			resolve();
		} else {
			console.log("\nThere are no new G+ posts since last scrape.");
			resolve();
		}
	});
}).then(function () {
	close(db);
}).catch(function (error) {
	console.log("\nAn error has occurred ...");
	console.log(error);

	close(db);
});