# Controversies of Science API

This is the new backend db and controller for the Controversies of Science API.  The former backend was built on top of Apigee's Usergrid NoSQL.

To set up and populate the Mongodb database with controversy data, run:

    npm run build
    node src/js/setup.js

## State of the Project

I am currently in the midst of porting this backend over.  I'm able to grab the G+ Collection, as before, and the next step is to persist them into the Mongo db.

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

