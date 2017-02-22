# Controversies of Science API

This is the new backend db and controller for the Controversies of Science API.  The former backend was built on top of Apigee's Usergrid NoSQL.

To set up and populate the Mongodb database with controversy data, run:

    npm run build
    node setup.js

## State of the Project

I am currently in the midst of porting this backend over.  I'm able to grab the G+ Collection, as before, and the next step is to persist them into the Mongo db.
