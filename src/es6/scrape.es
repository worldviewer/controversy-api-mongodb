// TODO: Consider just dropping table every time, then recreating.
// TODO: Refactor to also update mLab database

const
	Db = require('mongodb').Db,
	Server = require('mongodb').Server,
	MongoClient = require('mongodb').MongoClient,
	fs = require('fs'),
	request = require('request'),
	slugify = require('slugify'),
	execSync = require('child_process').execSync,
	ObjectId = require('mongodb').ObjectId,
	Thumbnail = require('thumbnail'),
	port = 27017,
	host = "localhost",
	dbName = "controversies",
	url = `mongodb://${host}:${port}/${dbName}`,
	assert = require('assert'),
	GPlus = require('./gplus').default,
	loadJsonFile = require('load-json-file'),
	METACARDS = 'metacards',
	CARDS = 'cards',
	prototypeObjectId = '58b8f1f7b2ef4ddae2fb8b17',
	cardImageDirectory = 'img/cards/',
	feedImageDirectories = [
		'img/feeds/halton-arp-the-modern-galileo/worldview/',
		'img/feeds/halton-arp-the-modern-galileo/model/',
		'img/feeds/halton-arp-the-modern-galileo/propositional/',
		'img/feeds/halton-arp-the-modern-galileo/conceptual/',
		'img/feeds/halton-arp-the-modern-galileo/narrative/'],
	controversyJSON = 'json/halton-arp.json'; // relative to root

let db = null,
	combinedJSON = [],
	allFeedImages = [],
	gplusMetacards, // Controversy card metadata from G+
	mongoMetacards,
	mongoCards,
	savedCount,
	mongoMetadata,
	shouldScrape = false,
	prototypeCard;

function create() {
	return new Promise((resolve, reject) => {
		resolve(new Db(dbName, new Server(host, port)));		
	})
}

function open() {
	return new Promise((resolve, reject) => {
		MongoClient.connect(url, (err, database) => {
			if (err) {
				reject(err);
			} else {
				resolve(database);
			}
		});
	});
}

// Slugify, lower the casing, then remove periods and apostrophes
function createSlug(cardName) {
	let slugInitial = slugify(cardName),
		slugLower = slugInitial.toLowerCase(),
		slugFinal = slugLower.replace(/['.]/g, '');

	return slugFinal;
}

function saveImage(url, destination, resolve, reject) {
	request.get({url, encoding: 'binary'}, (err, response, body) => {
		fs.writeFile(destination, body, 'binary', (err) => {
			if (err) { 
				reject(err);
			} else {
				console.log(destination + ' successfully saved.');
				resolve();
			}
		}); 
	});
}

function createThumbnail(input, output, isAlreadyGenerated) {
	return new Promise((resolve, reject) => {
		if (isAlreadyGenerated) {
			console.log('Thumbnail already generated for ' + input);
			resolve();
		} else {
			let thumbnail = new Thumbnail(input, output);

			thumbnail.ensureThumbnail('large.jpg', 506, 506, (err, filename) => {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		}
	})
}

function removeSystemFiles(list) {
	return list.filter(el => !el.match(/\.DS_Store/));
}

function close(db) {
	if (db) {
		db.close();
	}
}

function scrapeCollection(resolve, reject) {
	console.log('\nSynchronizing backend with Google Plus collection ...');

	let gplus = new GPlus();
	gplus.init();

	// Recursive promise chain to deal with API pagination
	// GPlus class handles aggregation of data
	let getPage = function() {
		gplus.scrapeCards().then(
			(data) => {
				// Send back an array of the card titles which have been added
				if (gplus.nextPageToken && gplus.more) {
					getPage();
				} else {
					console.log('\nScrape Results:\n');
					console.log([...gplus.titlesAdded]);

					resolve(gplus.getCollection());
				}
			}
		)
		.catch((data) => {
			console.log("\nAlthough keys do indeed exist to access the G+ API, either the keys are invalid or the request has failed. If you wish to proceed without scraping the G+ API, consider removing the keys from your environment variables.");
			console.log("Status Code: " + data.statusCode);
			console.log("Error: " + data.error);

			reject();
		});
	}

	getPage();
}

create()
	.then(() => {
		return open();	
	})

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

	// Grab the metadata which has been manually typed in for each controversy card
	.then((count) => {
		savedCount = count;

		return new Promise((resolve, reject) => {
			fs.readFile('json/metacards.json', 'utf8', (err, cards) => {
				if (err) {
					reject(err);
				} else {
					resolve(JSON.parse(cards));
				}
			});			
		})
	})

	.then((JSONCards) => {
		return new Promise((resolve, reject) => {
			if (savedCount === 0 && shouldScrape) {

				console.log("\nThere are currently " + savedCount +
					" metacards in the controversies collection.");
				console.log("\nSaving Scraped data to MongoDB");

				gplusMetacards.forEach((gplusCard) => {
					let slug = createSlug(gplusCard.name),
						json = JSONCards.filter((el) => el.slug === slug ? true : false);

					combinedJSON.push(Object.assign({}, gplusCard, json[0]));
				});

				resolve(mongoMetacards.insertMany(combinedJSON));

			} else if (gplusMetacards && gplusMetacards.length > savedCount) {

				console.log("\nThere are currently " + savedCount +
					" metacards in the controversies collection.");				
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
	})

	.then(() => {
		console.log('\nExporting the combined JSON to json/algolia.json\n');

		return new Promise((resolve, reject) => {
			fs.writeFile('json/algolia.json', JSON.stringify(combinedJSON), 'utf-8', (err) => {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	})

	.then(() => {
		return new Promise((resolve, reject) => {
			resolve(mongoMetacards.count());
		});
	})	

	.then((count) => {
		savedCount = count;

		console.log("\nThere are now " + savedCount +
			" metacards in the controversies collection.");
		console.log("\nNow adding prototype card data for Halton Arp controversy card.");
		console.log("(Note that any trailing commas within the JSON may cause an 'Invalid property descriptor' error.)");

		return new Promise((resolve, reject) => {
			resolve(loadJsonFile(controversyJSON));
		});
	})

	.then((json) => {
		// Fix the prototype ObjectId
		prototypeCard = Object.assign({}, json, {"_id": new ObjectId(prototypeObjectId)});

		return new Promise((resolve, reject) => {
			resolve(db.collection(CARDS));
		});		
	})

	.then((collection) => {
		mongoCards = collection;

		return new Promise((resolve, reject) => {
			resolve(mongoCards.count());
		});		
	})

	.then((count) => {
		return new Promise((resolve, reject) => {
			if (count === 0) {
				console.log("\nThere is no prototype controversy card to test frontend with.  Adding.")

				resolve(mongoCards.insertOne(prototypeCard));
			} else {
				console.log("\nThe prototype controversy card has already been added.");

				resolve();
			}
		});		
	})

	// create directory from card id, download and save image into that directory, then rename that file to large.jpg
	.then(() => {
		return db.collection(METACARDS)
			.find({})
			.map(x => { return {
				'image': x.image,
				'name': x.name,
				'thumbnail': x.thumbnail,
				'url': x.url,
				'text': x.text }})
			.toArray();
	})

	// WARNING: It's a good idea to double-check that the images are valid images after saving.  Note as well that the Google API does not always serve a high-quality image, so they must sometimes be manually downloaded (Really dumb).
	.then((cards) => {
		mongoMetadata = cards;

		console.log('\nSaving images to local directory. I recommend checking the images afterwards to make sure that the downloads were all successful. The scrape script appears to require a couple of scrapes to fully download all of them, probably due to the large amount of image data ...\n');

		let promiseArray = cards.map((card) => {
			return new Promise((resolve, reject) => {

				let slug = createSlug(card.name),
					imageDirectory = cardImageDirectory + slug;

				// Check if we have read/write access to the directory
				fs.access(imageDirectory, fs.constants.R_OK | fs.constants.W_OK, (access_err) => {

					// Slug-named directory does not exist
					if (access_err) {
						fs.mkdir(imageDirectory, (mkdir_err, folder) => {
							if (mkdir_err) {
								reject(mkdir_err);
							} else {
								saveImage(card.image, imageDirectory + '/large.jpg', resolve, reject);
							}
						});

					// Directory exists ...
					} else {
						fs.readdir(imageDirectory, (readdir_err, files) => {

							if (readdir_err) {
								reject(readdir_err);
							}

							removeSystemFiles(files);

							// ... but there is no image file
							if (files.length === 0) {
								console.log('Saving image ' + imageDirectory + '...');
								saveImage(card.image, imageDirectory + '/large.jpg', resolve, reject);
							} else {
								console.log('Image already captured for ' + imageDirectory);
								resolve();
							}
						});	
					}
				});
			});
		});

		return Promise.all(promiseArray);
	})

	// grab all controversy card image directories
	.then(() => {
		return new Promise((resolve, reject) => {
			fs.readdir(cardImageDirectory, (err, files) => {
				if (err) {
					reject(err);
				} else {
					resolve(files);
				}
			})	
		})
	})

	// TODO: I already have all of these image pyramids, but when it comes time to generate more,
	// I'll need to fix this Promise chain, which includes a synchronous exec()

	// .then((directories) => {
	// 	console.log('\nSlicing up large-format images into pyramids, one at a time ...\n');

	// 	let sliceOps = directories.reduce((promiseChain, directory) => {
	// 		return promiseChain.then(() => new Promise((resolve, reject) => {

	// 			if (directory !== '.DS_Store') {
	// 				fs.readdir(cardImageDirectory + directory, (readdir_err, files) => {
	// 					if (readdir_err) {
	// 						return Promise.reject(readdir_err);

	// 					} else if (!files.includes('pyramid_files')) {
	// 						execSync('./magick-slicer.sh ' + cardImageDirectory + directory + '/large.jpg -o ' + cardImageDirectory + directory + '/pyramid',
	// 							(error, stdout, stderr) => {

	// 							console.log('Slicing ' + directory);

	// 							if (error) {
	// 								Promise.reject(error);
	// 							} else {
	// 								console.log(directory + ' successfully sliced.');
	// 								resolve();
	// 							}
	// 						});						
	// 					} else {
	// 						console.log(directory + ' already sliced.');
	// 						resolve();
	// 					}
	// 				});
	// 			}

	// 		}));
	// 	}, Promise.resolve());

	// 	sliceOps.then(() => { return Promise.resolve(); } );
	// })

	.then(() => {
		console.log('\nSaving the controversy card thumbnails ...\n');

		let promiseArray = mongoMetadata.map((card) => {
			return new Promise((resolve, reject) => {
				let slug = createSlug(card.name),
					thumbnailDirectory = cardImageDirectory + slug;

				fs.readdir(thumbnailDirectory, (readdir_err, files) => {
					if (readdir_err) {
						reject(readdir_err);

					} else if (!files.includes('thumbnail.jpg')) {
						console.log('Saving thumbnail ' + thumbnailDirectory + '...');
						saveImage(card.thumbnail, thumbnailDirectory + '/thumbnail.jpg', resolve, reject);					
					} else {
						console.log('Thumbnail already captured for ' + thumbnailDirectory);
						resolve();
					}
				});

			});
		});

		return Promise.all(promiseArray);
	})

	// grab all feed post image directories
	.then(() => {
		let promiseArray = feedImageDirectories.map((feedImageDirectory) => {
			return new Promise((resolve, reject) => {
				fs.readdir(feedImageDirectory, (err, files) => {
					files = files.map(file => feedImageDirectory + file);

					if (err) {
						reject(err);
					} else {
						allFeedImages = allFeedImages.concat(files);
						resolve();
					}
				})
			});
		});

		return Promise.all(promiseArray);
	})

	.then(() => {
		console.log('\nGenerating thumbnails from feed posts ...\n');

		allFeedImages = removeSystemFiles(allFeedImages);
		let feedCardCount = 0;

		return new Promise((resolve, reject) => {
			let syncThumbnail = function() {
				fs.readdir(allFeedImages[feedCardCount], (readdir_err, files) => {

					if (readdir_err) {
						reject(readdir_err);
					}

					createThumbnail(allFeedImages[feedCardCount],
						allFeedImages[feedCardCount], files.includes('thumbnail.jpg')).then(
						() => {

						if (!files.includes('thumbnail.jpg')) {
							console.log('Thumbnail generated for ' + allFeedImages[feedCardCount]);
						}

						if (feedCardCount < allFeedImages.length) {
							syncThumbnail();
						} else {
							resolve();
						}
					})
					.catch((err) => {
						reject(err);
					});

					feedCardCount++;				
				});	
			}

			syncThumbnail();
		});
	})

	.then(() => {
		console.log("\nAll done and no issues.");

		close(db);	
	})

	.catch((error) => {
		console.log("\nAn error has occurred ...");

		if (error) {
			console.log(error);
		}

		close(db);
	});
