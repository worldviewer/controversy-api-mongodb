const
	Db = require('mongodb').Db,
	Server = require('mongodb').Server,
	MongoClient = require('mongodb').MongoClient,
	url = "mongodb://localhost:27017/controversies",
	assert = require('assert'),
	GPlus = require('./gplus').default;

let db = null;

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

function syncCollection() {
	console.log('\nSynchronizing backend with Google Plus collection ...');

	// scrape controversy cards from G+ collection
	let gplus = new GPlus();
	gplus.init();

	let getPage = function() {
		var gplusPromise = new Promise(
			(resolve, reject) => {
				gplus.getNextCards(resolve, reject);
			}
		);

		gplusPromise.then(
			(scrapedCollection) => {
				// Send back an array of the card titles which have been added
				if (gplus.nextPageToken && gplus.more) {
					getPage();
				} else {
					console.log('\nScrape Results:\n');
					console.log([...gplus.titlesAdded]);

					// return gplus.updateBackend(gplus.collection, req, res);
				}
			}
		)
		.catch(
			(reason) => {
				console.log('\nScrape Error:');
				console.log(reason);
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
			console.log("Collection constroversies exists");
		} else {
			console.log("Collection does not exist.");
		}
	})
	.then(() => {
		syncCollection();
	})
	.then(() => {
		close(db);		
	})
	.catch((error) => {
		console.log("An error has occurred ...");
		console.log(error);

		close(db);
	});
