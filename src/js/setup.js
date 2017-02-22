'use strict';

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var Db = require('mongodb').Db,
    Server = require('mongodb').Server,
    MongoClient = require('mongodb').MongoClient,
    url = "mongodb://localhost:27017/controversies",
    assert = require('assert'),
    GPlus = require('./gplus').default;

var db = null;

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

function syncCollection() {
	console.log('\nSynchronizing backend with Google Plus collection ...');

	// scrape controversy cards from G+ collection
	var gplus = new GPlus();
	gplus.init();

	var getPage = function getPage() {
		var gplusPromise = new Promise(function (resolve, reject) {
			gplus.getNextCards(resolve, reject);
		});

		gplusPromise.then(function (scrapedCollection) {
			// Send back an array of the card titles which have been added
			if (gplus.nextPageToken && gplus.more) {
				getPage();
			} else {
				console.log('\nScrape Results:\n');
				console.log([].concat(_toConsumableArray(gplus.titlesAdded)));

				// return gplus.updateBackend(gplus.collection, req, res);
			}
		}).catch(function (reason) {
			console.log('\nScrape Error:');
			console.log(reason);
		});
	};

	getPage();
}

create();

open().then(function (database) {
	db = database;
	return database;
}).then(function (database) {
	if (collectionExists(db, "controversies")) {
		console.log("Collection constroversies exists");
	} else {
		console.log("Collection does not exist.");
	}
}).then(function () {
	syncCollection();
}).then(function () {
	close(db);
}).catch(function (error) {
	console.log("An error has occurred ...");
	console.log(error);

	close(db);
});