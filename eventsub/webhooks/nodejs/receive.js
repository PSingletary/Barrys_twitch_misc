/*

Twitch Eventsub is great for real time data
This example will handle receiving the data of a payload

This is a NodeJS example

*/

const fs = require('fs');
const path = require('path');

// Load configuation
const config = JSON.parse(fs.readFileSync(path.join(
    __dirname,
    'config.json'
)));

// Require depedancies
// express is used for handling incoming HTTP requests "like a webserver"
const express = require('express');
// cypto handles Crpytographic functions, sorta like passwords (for a bad example)
const crypto = require('crypto');
const tsscmp = require('tsscmp');

// Express basics
const app = express();
const http = require('http').Server(app);
http.listen(config.port, function() {
    console.log('Server raised on', config.port);
});

// Middleware!
// Express allows whats called middle ware
// it runs before (or after) other parts of the route runs
app.use(express.json({
    verify: function(req, res, buf, encoding) {
        // is there a hub to verify against
        req.twitch_eventsub = false;
        if (req.headers && req.headers.hasOwnProperty('twitch-eventsub-message-signature')) {
            req.twitch_eventsub = true;

            // id for dedupe
            let message_id = req.headers['twitch-eventsub-message-id'];
            // check age
            let timestamp = req.headers['twitch-eventsub-message-timestamp'];
            // extract algo and signature for comparison
            let [ signatureAlgo, signatureHash ] = req.headers['twitch-eventsub-message-signature'].split('=');

            // you could do
            // req.twitch_hex = crypto.createHmac(algo, config.hook_secret)
            // but we know Twitch should always use sha256

            // so validate that

            if (signatureAlgo !== 'sha256') {
                console.log('Signature algo not matched');
                res.status(500).send('Invalid signature algo');
                return;
            }

            const ourSignatureHash = crypto.createHmac('sha256', config.hook_secret)
                .update(`${message_id}${timestamp}${buf}`)
                .digest('hex');

            if (!signatureHash || !tsscmp(signatureHash, ourSignatureHash)) {
                console.log('Signature not matched');
                res.status(500).send('Signature not matched');
                return;
            }
            
            // as an API style/EventSub handler
            // force set a/ensure a correct content type header
            // for all event sub routes
            res.set('Content-Type', 'text/plain');
            console.log('Signature matched');
        }
    }
}));

// Routes
app
    .route('/')
    .get((req, res) => {
        console.log('Incoming Get request on /');
        res.send('There is no GET Handler');
    })
    .post((req, res) => {
        console.log('Incoming Post request on /', req.body);

        // poor man cop out from the json verify function above
        if (res.headersSent) {
            return;
        }
    
        // the middleware above ran
        // and it prepared the tests for us
        // so check if we event generated a twitch_hub
        if (req.twitch_eventsub) {
            // is it a verification request
            if (req.headers['twitch-eventsub-message-type'] == 'webhook_callback_verification') {
                // it's a another check for if it's a challenge request
                if (req.body.hasOwnProperty('challenge')) {
                    console.log('Got a challenge, return the challenge');
                    res.send(encodeURIComponent(req.body.challenge));
                    return;
                }
                // unexpected hook request
                res.status(403).send('Denied');
            } else if (req.headers['twitch-eventsub-message-type'] == 'revocation') {
                // the webhook was revoked
                // you should probably do something more useful here
                // than this example does
                res.send('Ok');
            } else if (req.headers['twitch-eventsub-message-type'] == 'notification') {
                console.log('The signature matched');
                // the signature passed so it should be a valid payload from Twitch
                // we ok as quickly as possible
                res.send('Ok');

                // you can do whatever you want with the data
                // it's in req.body

                // write out the data to a log for now
                fs.appendFileSync(path.join(
                    __dirname,
                    'webhooks.log'
                ), JSON.stringify({
                    body: req.body,
                    headers: req.headers
                }) + "\n");
                // pretty print the last webhook to a file
                fs.appendFileSync(path.join(
                    __dirname,
                    'last_webhooks.log'
                ), JSON.stringify({
                    body: req.body,
                    headers: req.headers
                }, null, 4));
            } else {
                console.log('Invalid hook sent to me');
                // probably should error here as an invalid hook payload
                res.send('Ok');
            }
        } else {
            console.log('It didn\'t seem to be a Twitch Hook');
            // again, not normally called
            // but dump out a OK
            res.send('Ok');
        }
    });
