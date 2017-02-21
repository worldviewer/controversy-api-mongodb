const
	Db = require('mongodb').Db,
	Server = require('mongodb').Server,
	MongoClient = require('mongodb').MongoClient,
	url = "mongodb://localhost:27017/controversies",
	assert = require('assert');

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

		close(db);
	})
	.catch((error) => {
		console.log("Error opening MongoDB at " + url);
		console.log(error);
	});
