const
	Db = require('mongodb').Db,
	Server = require('mongodb').Server,
	MongoClient = require('mongodb').MongoClient,
	ObjectId = require('mongodb').ObjectId;

let db = null;

const
	fs = require('fs'),
	request = require('request'),
	slugify = require('slugify'),
	execSync = require('child_process').execSync,
	Thumbnail = require('thumbnail'),
	GPlus = require('./gplus').default,
	loadJSONFile = require('load-json-file'),
	frontMatter = require('front-matter'),
	pageDown = require('pagedown'), // Markdown processor used by Stack Overflow
	markdownConverter = pageDown.getSanitizingConverter();

// MongoDB configuration
let mongodb = {
		port: 27017,
		host: 'localhost',
		dbName: 'controversies'
	};

	mongodb.url = `mongodb://${mongodb.host}:${mongodb.port}/${mongodb.dbName}`;

const
	feedThumbnailSize = 506,

	// Hard-coded local data directory structures
	dir = {
		images: {
			cards: 'img/cards/',
			feeds: [
				'img/feeds/halton-arp-the-modern-galileo/worldview/',
				'img/feeds/halton-arp-the-modern-galileo/model/',
				'img/feeds/halton-arp-the-modern-galileo/propositional/',
				'img/feeds/halton-arp-the-modern-galileo/conceptual/',
				'img/feeds/halton-arp-the-modern-galileo/narrative/'
			]
		},
		md: {
			feeds: [
				'md/feeds/halton-arp-the-modern-galileo/worldview/',
				'md/feeds/halton-arp-the-modern-galileo/model/',
				'md/feeds/halton-arp-the-modern-galileo/propositional/',
				'md/feeds/halton-arp-the-modern-galileo/conceptual/',
				'md/feeds/halton-arp-the-modern-galileo/narrative/'
			]
		}
	},

	// Asset CDN's
	url = {
		feeds: 'https://controversy-cards-feeds.s3.amazonaws.com/halton-arp-the-modern-galileo/',
		cards: 'https://controversy-cards-images.s3.amazonaws.com/'
	},

	// Hard-coded JSON data input
	input = {
		proto: 'json/halton-arp.json',
		cards: 'json/cards.json',
		feeds: 'json/feeds.json'
	},

	// JSON outputs for Algolia Search
	output = {
		cards: 'json/algolia-cards.json',
		feeds: 'json/algolia-feeds.json'
	},

	// Algolia Search requires that paragraphs are chunked into separate records.
	// This split string differs by markdown processor; Google+ uses a pair of <br>'s,
	// whereas pageDown uses a pair of carriage returns.
	stop = {
		cards: '<br /><br />',
		feeds: '\n\n'
	};

let savedCardCount,
	gplusKeysExist = false,

	mongo = {
		cards: { // react-worldviewer-app
			collection: null,
			data: null,
			ref: 'metacards'
		},
		proto: { // react-worldviewer-prototype
			collection: null,
			data: null,
			id: '58b8f1f7b2ef4ddae2fb8b17',
			ref: 'cards'
		}
	},

	algolia = {
		sliced: {
			feeds: [],
			cards: []
		},
		feed: {
			posts: [], // raw feed post content
			images: [], // full local image pathnames
			markdowns: [] // feed post markdown only
		}
	},

	google = {
		cards: null // from G+ API
	};

function create() {
	return new Promise((resolve, reject) => {
		resolve(new Db(mongodb.dbName, new Server(mongodb.host, mongodb.port)));		
	})
}

function open() {
	return new Promise((resolve, reject) => {
		MongoClient.connect(mongodb.url, (err, database) => {
			if (err) {
				reject(err);
			} else {
				resolve(database);
			}
		});
	});
}

// Slugify controversy card titles, lower the casing, then remove periods and apostrophes
function createSlug(cardName) {
	let slugInitial = slugify(cardName),
		slugLower = slugInitial.toLowerCase(),
		slugFinal = slugLower.replace(/['.]/g, '');

	return slugFinal;
}

// Captures image from URL to local disk
function saveImage(url, destination, resolve, reject) {
	request.get({url, encoding: 'binary'}, (err, response, body) => {
		fs.writeFile(destination, body, 'binary', err => {
			if (err) { 
				reject(err);
			} else {
				console.log(destination + ' successfully saved.');
				resolve();
			}
		}); 
	});
}

// Algolia Search requires chunking by paragraph
function splitText(slug, text, breakString) {
	return text.split(breakString).map((paragraph, i) => {
		return {
			id: slug + '-paragraph-' + i,
			paragraph
		}
	});
}

// TODO: Rename resulting file to thumbnail.jpg
function createThumbnail(input, output, isAlreadyGenerated) {
	return new Promise((resolve, reject) => {
		if (isAlreadyGenerated) {
			console.log('Thumbnail already generated for ' + input);
			resolve();
		} else {
			let thumbnail = new Thumbnail(input, output);

			thumbnail.ensureThumbnail('large.jpg', feedThumbnailSize, feedThumbnailSize, (err, filename) => {
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
			data => {
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

	// Check that G+ API keys exist
	.then((database) => {
		db = database;
		gplusKeysExist = GPlus.keysExist();

		return database;
	})

	// Save a reference to the metacards MongoDB collection
	.then(database => {
		return new Promise((resolve, reject) => {
			resolve(db.collection(mongo.cards.ref));
		});
	})

	// Save all controversy card data from G+ collection
	.then(collection => {
		mongo.cards.collection = collection;

		console.log("\nChecking for Google+ API Keys in local environment.");

		return new Promise((resolve, reject) => {
			if (!gplusKeysExist) {
				console.log("\nNo keys found, will not scrape metadata.");

				resolve(null);
			} else {
				console.log("\nScraping G+ Collection.");

				scrapeCollection(resolve, reject);
			}
		});
	})

	// Delete the metacards collection in MongoDB
	.then(collection => {
		google.cards = collection;

		return new Promise((resolve, reject) => {
			resolve(mongo.cards.collection.drop());
		});
	})

	// Grab the metadata which has been manually typed in for each controversy card
	.then(() => {
		return new Promise((resolve, reject) => {
			resolve(loadJSONFile(input.cards));
		});
	})

	// Compose hardcoded JSON and G+ collection controversy card data into a single object, algolia.sliced.cards for
	// sending data to Algolia Search: We need slug, name, thumbnail, unique paragraph id and paragraph, but
	// for searchable fields, there should be no redundancy.  The redundancy should all occur with the metadata.

	// Also using this area to save the combined JSON to Mongo
	.then(cardsJSON => {
		return new Promise((resolve, reject) => {
			let mongoCards = [];

			console.log("\nSaving Scraped data to MongoDB");

			google.cards.forEach((gplusCard) => {
				let slug = createSlug(gplusCard.name),
					json = cardsJSON.filter((el) => el.slug === slug ? true : false)[0],
					splitByParagraph = splitText(slug, gplusCard.text, stop.cards),

					algoliaMetadata = {
						slug: json.slug,
						gplusUrl: gplusCard.url,
						publishDate: gplusCard.publishDate,
						updateDate: gplusCard.updateDate,
						projectUrl: '',
						metrics: [],
						images: {
							large: {
								url: url.cards + slug + '/large.jpg',
								width: json.images.large.width,
								height: json.images.large.height
							},
							thumbnail: {
								url: url.cards + slug + '/thumbnail.jpg'
							},
							pyramid: {
								url: url.cards + slug + '/pyramid_files/',
								maxZoomLevel: json.images.pyramid.maxZoomLevel,
								TileSize: json.images.pyramid.TileSize
							}
						}
					};

				// Save card name
				let cardNameJSON = Object.assign({}, { cardName: gplusCard.name }, algoliaMetadata);

				algolia.sliced.cards = algolia.sliced.cards.concat(cardNameJSON);

				// Save card category
				let categoryJSON = Object.assign({}, { cardCategory: gplusCard.category }, algoliaMetadata);

				algolia.sliced.cards = algolia.sliced.cards.concat(categoryJSON);

				// Save card summary
				let summaryJSON = Object.assign({}, { cardSummary: gplusCard.summary }, algoliaMetadata);

				algolia.sliced.cards = algolia.sliced.cards.concat(summaryJSON);

				// Save all paragraphs for card
				let smallerChunkJSON = splitByParagraph.map(paragraphJSON => 
					Object.assign({}, {id: paragraphJSON.id, cardParagraph: paragraphJSON.paragraph}, algoliaMetadata)
				);

				algolia.sliced.cards = algolia.sliced.cards.concat(smallerChunkJSON);

				mongoCards.push(Object.assign({}, gplusCard, json[0]));
			});

			resolve(mongo.cards.collection.insertMany(mongoCards));
		});
	})

	// Export that composed object to a JSON file, for importing into Algolia search service
	.then(() => {
		return new Promise((resolve, reject) => {
			if (algolia.sliced.cards) {
				console.log('\nExporting the combined JSON to ' + output.cards);

				fs.writeFile(output.cards, JSON.stringify(algolia.sliced.cards), 'utf-8', (err) => {
					if (err) {
						reject(err);
					} else {
						resolve();
					}
				});
			} else {
				console.log('\nSkipping the export of the combined JSON because it is empty.\n');
			}
		});
	})

	// Check number of controversy cards in MongoDB post-save
	.then(() => {
		return new Promise((resolve, reject) => {
			resolve(mongo.cards.collection.count());
		});
	})	

	// Load the Halton Arp hardcoded JSON for the animated infographic
	.then(count => {
		savedCardCount = count;

		console.log("\nThere are now " + savedCardCount +
			" metacards in the controversies collection.");
		console.log("\nNow adding prototype card data for Halton Arp controversy card.");
		console.log("(Note that any trailing commas within the JSON may cause an 'Invalid property descriptor' error.)");

		return new Promise((resolve, reject) => {
			resolve(loadJSONFile(input.proto));
		});
	})

	// Get reference to the prototype data in MongoDB
	.then(json => {
		// Fix the prototype ObjectId
		mongo.proto.data = Object.assign({}, json, {"_id": new ObjectId(mongo.proto.id)});

		return new Promise((resolve, reject) => {
			resolve(db.collection(mongo.proto.ref));
		});		
	})

	// Count number of cards stored in MongoDB prototype dataset
	.then(collection => {
		mongo.proto.collection = collection;

		return new Promise((resolve, reject) => {
			resolve(mongo.proto.collection.count());
		});		
	})

	// Observe that it's necessary to delete existing cards data in MongoDB before it will save
	// mongo --> use controversies; --> db.cards.drop();
	.then(count => {
		return new Promise((resolve, reject) => {
			if (count === 0) {
				console.log("\nThere is no prototype controversy card to test frontend with.  Adding.")

				resolve(mongo.proto.collection.insertOne(mongo.proto.data));
			} else {
				console.log("\nThe prototype controversy card has already been added.");

				resolve();
			}
		});		
	})

	// Get all controversy card data from MongoDB
	.then(() => {
		return mongo.cards.collection
			.find({})
			.map(x => { return {
				'image': x.image,
				'name': x.name,
				'thumbnail': x.thumbnail,
				'url': x.url,
				'text': x.text }})
			.toArray();
	})

	// create directory from card id, download and save image into that directory, then rename that file to large.jpg

	// WARNING: It's a good idea to double-check that the images are valid images after saving.  Note as well that the Google API does not always serve a high-quality image, so they must sometimes be manually downloaded (Really dumb).
	.then(cards => {
		mongo.cards.data = cards;

		console.log('\nSaving images to local directory. I recommend checking the images afterwards to make sure that the downloads were all successful. The scrape script appears to require a couple of scrapes to fully download all of them, probably due to the large amount of image data ...\n');

		let promiseArray = cards.map(card => {
			return new Promise((resolve, reject) => {

				let slug = createSlug(card.name),
					imageDirectory = dir.images.cards + slug;

				// Check if we have read/write access to the directory
				fs.access(imageDirectory, fs.constants.R_OK | fs.constants.W_OK, access_err => {

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
			fs.readdir(dir.images.cards, (err, files) => {
				if (err) {
					reject(err);
				} else {
					resolve(files);
				}
			})	
		})
	})

	// OLD BROKEN CODE

	// .then((directories) => {
	// 	console.log('\nSlicing up large-format images into pyramids, one at a time ...\n');

	// 	let sliceOps = directories.reduce((promiseChain, directory) => {
	// 		return promiseChain.then(() => new Promise((resolve, reject) => {

	// 			if (directory !== '.DS_Store') {
	// 				fs.readdir(dir.images.cards + directory, (readdir_err, files) => {
	// 					if (readdir_err) {
	// 						return Promise.reject(readdir_err);

	// 					} else if (!files.includes('pyramid_files')) {
	// 						execSync('./magick-slicer.sh ' + dir.images.cards + directory + '/large.jpg -o ' + dir.images.cards + directory + '/pyramid',
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

	// Slice controversy card images into image pyramids using Magick-Slicer script, which itself invokes ImageMagick CLI
	// WARNING: This code has been refactored and needs to be retested when the need arises to slice up more image pyramids
	// .then((directories) => {
	// 	console.log('\nSlicing up large-format images into pyramids, one at a time ...\n');

	// 	let directories = removeSystemFiles(directories),
	// 		controversyCardCount = 0;

	// 	return new Promise((resolve, reject) => {
	// 		let syncSliceImages = function() {
	// 			let directory = directories[controversyCardCount];

	// 			fs.readdir(dir.images.cards + directory, (readdir_err, files) => {
	// 				if (readdir_err) {
	// 					reject(readdir_err);

	// 				} else if (!files.includes('pyramid_files')) {
	// 					if (controversyCardCount < directories.length) {
	// 						execSync('./magick-slicer.sh ' + dir.images.cards + directory +
	// 							'/large.jpg -o ' + dir.images.cards + directory + '/pyramid',
	// 							(slice_error, stdout, stderr) => {

	// 							console.log('Slicing ' + directory);

	// 							if (slice_error) {
	// 								reject(slice_error);
	// 							} else {
	// 								console.log(directory + ' successfully sliced.');
	// 							}
	// 						});
	// 					} else {
	// 						resolve();
	// 					}					
	// 				} else {
	// 					console.log(directory + ' already sliced.');
	// 				}

	// 				controversyCardCount++;
	// 				syncSliceImages();
	// 			});
	// 		}

	// 		syncSliceImages();
	// 	});				
	// })

	// Grab all controversy card thumbnails from G+ API
	.then(() => {
		console.log('\nSaving the controversy card thumbnails ...\n');

		let promiseArray = mongo.cards.data.map(card => {
			return new Promise((resolve, reject) => {
				let slug = createSlug(card.name),
					thumbnailDirectory = dir.images.cards + slug;

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

	// Grab all feed post image directories based upon local file structure
	.then(() => {
		let promiseArray = dir.images.feeds.map((feedImageDirectory) => {
			return new Promise((resolve, reject) => {
				fs.readdir(feedImageDirectory, (err, files) => {
					files = files.map(file => feedImageDirectory + file);

					if (err) {
						reject(err);
					} else {
						algolia.feed.images = algolia.feed.images.concat(files);
						resolve();
					}
				})
			});
		});

		return Promise.all(promiseArray);
	})

	// Generate thumbnails for the feed posts
	.then(() => {
		console.log('\nGenerating thumbnails from feed posts ...\n');

		algolia.feed.images = removeSystemFiles(algolia.feed.images);
		let feedCardCount = 0;

		return new Promise((resolve, reject) => {
			let syncThumbnail = function() {
				fs.readdir(algolia.feed.images[feedCardCount], (readdir_err, files) => {

					if (readdir_err) {
						reject(readdir_err);
					}

					createThumbnail(algolia.feed.images[feedCardCount],
						algolia.feed.images[feedCardCount], files.includes('thumbnail.jpg')).then(
						() => {

						if (!files.includes('thumbnail.jpg')) {
							console.log('Thumbnail generated for ' + algolia.feed.images[feedCardCount]);
						}

						if (feedCardCount < algolia.feed.images.length) {
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

	// Grab all feed post markdown directories based upon local file structure
	.then(() => {
		let promiseArray = dir.md.feeds.map((feedMarkdownDirectory) => {
			return new Promise((resolve, reject) => {
				fs.readdir(feedMarkdownDirectory, (err, files) => {
					files = files.map(file => feedMarkdownDirectory + file);

					if (err) {
						reject(err);
					} else {
						algolia.feed.markdowns = algolia.feed.markdowns.concat(files);
						resolve();
					}
				})
			});
		});

		return Promise.all(promiseArray);
	})

	// Fetch all feed posts from local file structure
	.then(() => {
		console.log('\nFetching from local directories all feed posts ...\n');

		algolia.feed.markdowns = removeSystemFiles(algolia.feed.markdowns);

		let feedMarkdownCount = 0;

		return new Promise((resolve, reject) => {
			let syncMarkdown = function() {
				fs.readdir(algolia.feed.markdowns[feedMarkdownCount], (readdir_err, files) => {

					if (readdir_err) {
						reject(readdir_err);
					}

					console.log('Fetching post for ' + algolia.feed.markdowns[feedMarkdownCount]);

					fs.readFile(algolia.feed.markdowns[feedMarkdownCount] + '/_index.md', 'utf8', (err, feedPost) => {
						if (err) {
							reject(err);
						} else {
							algolia.feed.posts.push(feedPost);
						}

						if (feedMarkdownCount < algolia.feed.markdowns.length) {
							syncMarkdown();
						} else {
							resolve();
						}
					});

					feedMarkdownCount++;				
				});	
			}

			syncMarkdown();
		});		
	})

	// Grab the metadata which has been manually typed in for the example Halton Arp feed posts
	.then(() => {
		return new Promise((resolve, reject) => {
			resolve(loadJSONFile(input.feeds));		
		});
	})

	// Process the hard-coded feed front-matter and markdown into HTML and JSON
	.then((postsJSON) => {
		console.log('\nConverting all markdown into HTML ...');

		let promiseArray = algolia.feed.posts.map((post, postCount) => {
			return new Promise((resolve, reject) => {
				let feedPostObject = frontMatter(post),
					longSlug = algolia.feed.markdowns[postCount].split('/'),
					slug = longSlug[longSlug.length-1],
					feedPostAttributes = feedPostObject.attributes,
					feedPostHTML = markdownConverter.makeHtml(feedPostObject.body),
					inputFeedsJSON = [];

				postsJSON.forEach(post => {
					inputFeedsJSON.push(post);
				});

				let json = inputFeedsJSON.filter((el) => el.slug === slug ? true : false)[0];

				if (!json) {
					reject('It is quite likely that there is a mismatch between directory structure in /md and /img directories.  It appears that the problem relates to feed post ' + slug + '\n');
				}

				let
					feedPostParagraphs = splitText(slug, feedPostHTML, stop.feeds),
					algoliaFeedPost = [],

					algoliaMetadata = {
						card: feedPostAttributes.controversy,
						discourseLevel: feedPostAttributes.discourse_level,
						authors: feedPostAttributes.authors,
						publishDate: feedPostAttributes.date,
						updateDate: feedPostAttributes.lastmod,
						projectUrl: feedPostAttributes.project_url,
						categories: feedPostAttributes.categories,
						metrics: feedPostAttributes.metrics,
						images: {
							large: {
								url: url.feeds + feedPostAttributes.discourse_level + '/' + slug + '/large.jpg',
								width: json.images.large.width,
								height: json.images.large.height
							},
							thumbnail: {
								url: url.feeds + feedPostAttributes.discourse_level + '/' + slug + '/thumbnail.jpg'
							},
							pyramid: {
								url: url.feeds + feedPostAttributes.discourse_level + '/' + slug + '/pyramid_files/',
								maxZoomLevel: json.images.pyramid.maxZoomLevel,
								TileSize: json.images.pyramid.TileSize
							}
						}
					};

				algolia.sliced.feeds = algolia.sliced.feeds.concat(Object.assign({},
					{ postName: feedPostAttributes.title },
					algoliaMetadata
				));

				feedPostParagraphs.forEach(paragraph => {
					algoliaFeedPost.push(Object.assign({},
						{ id: paragraph.id },
						algoliaMetadata,
						{ postParagraph: paragraph.paragraph }))
				});

				algolia.sliced.feeds = algolia.sliced.feeds.concat(algoliaFeedPost);
				resolve();
			});
		});

		return Promise.all(promiseArray);
	})

	// Export that composed object to a JSON file, for importing into Algolia search service
	.then(() => {
		return new Promise((resolve, reject) => {
			if (algolia.sliced.feeds) {
				console.log('\nExporting the feeds JSON to ' + output.feeds);

				fs.writeFile(output.feeds, JSON.stringify(algolia.sliced.feeds), 'utf-8', err => {
					if (err) {
						reject(err);
					} else {
						resolve();
					}
				});
			} else {
				console.log('\nSkipping the export of the feeds JSON because it is empty.\n');
			}
		});
	})

	.then(() => {
		console.log("\nAll done and no issues.");

		close(db);	
	})

	.catch(error => {
		console.log("\nAn error has occurred ...");

		if (error) {
			console.log(error);
		}

		close(db);
	});
