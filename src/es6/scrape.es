const
	Db = require('mongodb').Db,
	Server = require('mongodb').Server,
	MongoClient = require('mongodb').MongoClient,
	url = "mongodb://localhost:27017/controversies",
	assert = require('assert'),
	GPlus = require('./gplus').default,
	METACARDS = 'metacards';

let db = null,
	gplusMetacards, // Controversy card metadata from G+
	mongoMetacards,
	savedCount,
	shouldScrape = false;

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

// function createCollection(db, collection) {
// 	return new Promise((resolve, reject) => {
// 		db.collection(collection, (err, db) => {
// 			if (err) {
// 				console.log(err);
// 				reject(false);
// 			} else {
// 				resolve(true);
// 			}
// 		})
// 	});
// }

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
		shouldScrape = GPlus.keysExist();

		return database;
	})
	.then((database) => {
		return new Promise((resolve, reject) => {
			resolve(db.collection(METACARDS));
		});
	})
	.then((collection) => {
		mongoMetacards = collection;
	})
	.then(() => {
		console.log("\nChecking for Google+ API Keys in local environment.");

		return new Promise((resolve, reject) => {
			if (!shouldScrape) {
				console.log("\nNo keys found, will not scrape metadata.");

				resolve(null);
			} else {
				console.log("\nScraping G+ Collection.");

				scrapeCollection(resolve, reject);
			}
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

		console.log("\nThere are currently " + savedCount +
			" metacards in the controversies collection.");

		return new Promise((resolve, reject) => {
			if (savedCount === 0 && shouldScrape) {
				console.log("\nSaving Scraped data to MongoDB");

				resolve(mongoMetacards.insertMany(gplusMetacards));
			} else if (gplusMetacards && gplusMetacards.length > savedCount) {
				console.log("\nThere are new G+ posts since last scrape.");
				resolve();
			} else if (gplusMetacards && gplusMetacards.length === savedCount) {
				console.log("\nThere are no new G+ posts since last scrape.");
				resolve();
			} else if (!shouldScrape) {
				console.log("\nWill set up backend without G+ metadata.  See README for more information.");
				resolve(null);
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
