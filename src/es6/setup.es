const
	Db = require('mongodb').Db,
	Server = require('mongodb').Server,
	MongoClient = require('mongodb').MongoClient,
	url = "mongodb://localhost:27017/controversies",
	assert = require('assert'),
	GPlus = require('./gplus').default,
	METACARDS = 'metacards';

let db = null,
	gplusMetacards,
	mongoMetacards,
	savedCount;

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
		if (collectionExists(db, METACARDS)) {
			console.log("\nMetacards collection exists");

			return new Promise((resolve, reject) => {
				resolve(db.collection(METACARDS));
			});
		} else {
			console.log("\nMetacards collection does not exist, will create.");

			return new Promise((resolve, reject) => {
				resolve(db.createCollection(METACARDS));
			})
		}
	})
	.then((collection) => {
		mongoMetacards = collection;
	})
	.then(() => {
		console.log("\nScraping G+ Collection.");

		return new Promise((resolve, reject) => {
			scrapeCollection(resolve, reject);
		});
	})
	.then((collection) => {
		gplusMetacards = collection;

		return new Promise((resolve, reject) => {
			resolve(mongoMetacards.count());
		});
	})
	.then((count) => {
		savedCount = count;

		console.log("\nThere are currently " + savedCount + " cards in the controversies collection.");

		return new Promise((resolve, reject) => {
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
	})
	.then(() => {
		close(db);		
	})
	.catch((error) => {
		console.log("\nAn error has occurred ...");
		console.log(error);

		close(db);
	});
