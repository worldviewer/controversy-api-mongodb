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

## The MongoDB Backend

I will be using AWS Lambda Node deployments for the time being to serve controversy card data, the image pyramid and the image assets.  This is being migrated from a former Usergrid implementation.

### Controversy Card /metadata Endpoint

    https://y3uwecnnmb.execute-api.us-east-1.amazonaws.com/dev/metacards

### Controversy /card/{id} Endpoint

    https://czlxg9sj34.execute-api.us-east-1.amazonaws.com/dev/cards/58b8f1f7b2ef4ddae2fb8b17

## State of the Project

The first two endpoints are now up.  The next two endpoints should look something like ...

    https://czlxg9sj34.execute-api.us-east-1.amazonaws.com/dev/cards/58b8f1f7b2ef4ddae2fb8b17/pyramid

... and ...

    https://czlxg9sj34.execute-api.us-east-1.amazonaws.com/dev/cards/58b8f1f7b2ef4ddae2fb8b17/overlays

Most immediately, I now need to refactor my app to use these endpoints.

The /metacards endpoint should allow for a category query parameter according to the categories listed below in "Data Source".

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

