# Controversies of Science API / Backend

This is the new backend db and controller for the Controversies of Science API.  The former backend was built on top of Apigee's Usergrid NoSQL.  Through those experiences, I have decided to transition this project to a more production-ready database technology.  Fortunately, there are a number of similarities between Usergrid and MongoDB.

This repo of course assumes that have mongodb set up and running on your local machine.  If you don't, consider using homebrew:

    brew install mongodb

## Controversy Card Data

The controversy card data required to test the Halton Arp controversy prototype at https://github.com/worldviewer/react-worldviewer-prototype will soon be hardcoded into the scrape script.  No further action is currently required to set up the backend.

## Controversy Card Metadata

That said, this will not always be the case.  As the prototype builds out, we'll need access to more than just information about the Halton Arp controversy card.  That means grabbing the metadata for all of the current controversy cards in the Controversies of Science collection.

If the scrape script detects that the Google+ API key environment variables are set, it will populate the mongodb database controversy card metadata from the G+ API.

Access to the G+ API requires an API key from Google.  For more information on how to do that, go here:

    https://developers.google.com/+/web/api/rest/oauth

The scrape script assumes that you have two environmental key variables set, and will only perform the G+ scrape if valid values are provided for these two keys:

    export GPLUS_USER_ID='<a long number>'
    export GPLUS_API_KEY='<a long alphanumeric string>'

These would be set in a file like `.profile` or `.bash_profile` in your root (if you are using a Linux-based machine).

Either way -- with or without metadata -- to set up and populate the Mongodb database, run:

    npm run build
    npm run scrape

This will set up the backend with enough data to use the React frontend at https://github.com/worldviewer/react-worldviewer-prototype.

## Setting up an mLab Backend

At this current stage, we have a very simple backend.  So, my tech stack will bias towards ease-of-deployment and, for now, zero cost.  I was a little bit drawn by the sophistication of the Strongloop toolset, but for now I'm going with AWS Lambda using the Serverless API.  It's simple and free.

The first step is to set up an account at mLab and create a new deployment that is Single-node, Standard Line Sandbox.  Name the db:

    controversiesofscience

Pay close attention to the MongoDB version which mLab is hosting.  This must match your own local db version.  For my install, mLab is using 3.2.x.  So, I had to revert my own local MongoDB version with homebrew, as follows ...

    brew install homebrew/versions/mongodb32

... then ...

    brew unlink mongodb
    brew link --overwrite mongodb32

I found that the prior data was still there, so it was not necessary to re-scrape.  But I did just in case.

You can now click the button at mLab for `Create new MongoDB deployment`.

The next step is to transfer the db to mLab, first with export from the local ...

    mongoexport -h localhost:27017 -d controversies -c cards -o cards.db

    mongoexport -h localhost:27017 -d controversies -c metacards -o metacards.db

Make sure to attach a user login and password to the database on mLab.

... and then import into the remote ...

    mongoimport -h ds023550.mlab.com:23550 -d controversiesofscience -c metacards -u <user> -p <password> --file metacards.db

    mongoimport -h ds023550.mlab.com:23550 -d controversiesofscience -c cards -u <user> -p <password> --file cards.db

Now, to connect to the db on mLab ...

    mongodb://<dbuser>:<dbpassword>@ds023550.mlab.com:23550/controversiesofscience

## Setting up the Lambda AWS API Gateway

To install the Serverless CLI:

    npm install -g serverless

Then, scaffold the project:

    sls create --template aws-nodejs

Add from the package.json directory, install the node_modules ...

    npm install

The code expects an environment variable MLABDB to be set.  This should contain the mLab database connection info with login and password embedded into the request.  It should be set in ~/.bash_profile or something similar, like so:

    export MLABDB="mongodb://<dbuser>:<dbpassword>@ds023550.mlab.com:23550/controversiesofscience"




Instructions for seting up a Serverless API gateway for a DynamoDB backend, which we will adapt to MongoDB ...

https://github.com/serverless/examples/tree/master/aws-node-rest-api-with-dynamodb

A MongoDB adaptation is here ...

https://github.com/pcorey/serverless-mongodb/

Explanation here ...

http://www.east5th.co/blog/2016/06/06/mongodb-with-serverless/

## State of the Project

I am currently in the midst of setting up the Node/Express backend for deployment to AWS.

What I am thinking with this project, in order to give it a boost, is to wrap my existing React app into a Hackathon starter, like here:

    https://github.com/reactGo/reactGo
    Your One-Stop solution for a full-stack app with ES6/ES2015 React.js featuring universal Redux, React Router, React Router Redux Hot reloading, CSS modules, Express 4.x, and multiple ORMs.

I've also got my eye on some of the packages used -- especially authentication -- here:

    https://github.com/sahat/hackathon-starter
    Hackathon Starter: A kickstarter for Node.js web applications

The README at that second starter also details how to set up API keys for all of the OAuth services.

## Next Steps

- Scaffold React hackathon starter
- Import existing project into this starter in a fresh repo
- Set up Express with routes to return this detailed card data for prototype
- Use that data to load the overlays and image pyramid
- Switch deployment in hackathon starter from heroku to AWS
- Refactor app w/ Redux
- Drop in authentication/authorization from starter for Github, Google+, Twitter, Facebook
- Tweak authentication to suit app
- Improve splash screen
- Add swipes UI into React using React Router
- Create tests
- Create slideshow that summarizes most important points of text
- Wait to experiment with annotating the canvas as long as possible, look for a drop-in solution, or some combination of drop-in solutions

## Data Source

The cards are broken down into 6 categories:

- *ongoing* - Recent, ongoing controversies
- *historical* - Controversies possibly still at play, but more historical in nature
- *person* - Some people you should know about + character studies
- *reform* - Relevant to academic reform and redesigning scientific discourse
- *critique* - The best critical commentary ever published for modern science
- *thinking* - How to think like a scientist about controversies

The data is scraped from my Google Plus collection, here:

*Controversies of Science* - https://plus.google.com/collection/Yhn4Y

