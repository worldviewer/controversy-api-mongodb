const
	Db = require('mongodb').Db,
	Server = require('mongodb').Server,
	MongoClient = require('mongodb').MongoClient,
	url = "mongodb://localhost:27017/controversies",
	assert = require('assert'),
	GPlus = require('./gplus').default;

let db = null,
	collection;

function create() {
	db = new Db("controversies", new Server('localhost', 27017));
}

function open() {
	return new Promise((resolve, reject) => {
		MongoClient.connect(url, (err, db) => {
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
	return new Promise((resolve, reject) => {
		db.collection(collection, (err, db) => {
			if (err) {
				console.log(err);
				reject(false);
			} else {
				resolve(true);
			}
		})
	});
}

function scrapeCollection(resolve, reject) {
	console.log('\nSynchronizing backend with Google Plus collection ...');

	let gplus = new GPlus();
	gplus.init();

	// Recursive promise chain to deal with API pagination
	// GPlus class handles aggregation of data
	let getPage = function() {
		gplus.scrapeCards().then(
			() => {
				// Send back an array of the card titles which have been added
				if (gplus.nextPageToken && gplus.more) {
					getPage();
				} else {
					console.log('\nScrape Results:\n');
					console.log([...gplus.titlesAdded]);

					resolve(gplus.getCollection());
				}
			}
		);
	}

	getPage();
}

create();

open()
	.then((database) => {
		db = database;
		return database;
	})
	.then((database) => {
		if (collectionExists(db, "controversies")) {
			console.log("\nCollection controversies exists");
		} else {
			console.log("\nCollection does not exist.");
		}
	})
	.then(() => {
		return new Promise((resolve, reject) => {
			scrapeCollection(resolve, reject);
		});
	})
	.then((collection) => {
		console.log(collection);
		console.log('all done!');
	})
	.then(() => {
		close(db);		
	})
	.catch((error) => {
		console.log("\nAn error has occurred ...");
		console.log(error);

		close(db);
	});
