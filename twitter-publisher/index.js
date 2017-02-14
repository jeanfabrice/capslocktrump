#!/usr/bin/env node
var amqp     = require( 'amqplib/callback_api' );
var debug    = require( 'debug' )( 'twitter-publisher' );
var Twitter  = require( 'twitter' );
var util     = require( 'util' );
var _        = require( 'underscore' );
var fs       = require( 'fs' );
var readline = require( 'readline' );
var hostname = require( 'os' ).hostname();
var OAuth    = require( 'oauth' );
var config   = require( './config.json' );
debug( 'config: ', config );

// Load client secrets from a local file.
fs.readFile( './client_secret.json', function processClientSecrets( err, content ) {
  if( err ) {
    console.error( 'Error loading client secret file: ' + err );
    return;
  }

  authorize( JSON.parse( content ), bootstrapAMQP );

});

function authorize( credentials, callback ) {
  fs.readFile( './user_secret.json', function processUserSecrets( err, token ) {
    if( err ) {
      getNewToken( credentials, callback );
    }
    else {
      callback( _.extend( credentials, JSON.parse( token ) ) );
    }
  });
}

function getNewToken( credentials, callback ){
  var oauth = new OAuth.OAuth(
    'https://api.twitter.com/oauth/request_token',
    'https://api.twitter.com/oauth/access_token',
    credentials.consumer_key,
    credentials.consumer_secret,
    '1.0A',
    null,
    'HMAC-SHA1'
  );
  oauth.getOAuthRequestToken( function( err, oAuthToken, oAuthTokenSecret, results ) {
    if( err ) {
      console.error( 'Error requesting oAuthToken from Twitter: ' + err );
      return;
    }
    debug( 'results: ', results );
    debug( 'oAuthToken: ', oAuthToken );
    debug( 'oAuthTokenSecret: ', oAuthTokenSecret );

    console.log( 'Authorize this app by visiting this url: https://twitter.com/oauth/authenticate?oauth_token=' + oAuthToken );
    var rl = readline.createInterface({
      input:  process.stdin,
      output: process.stdout
    });
    rl.question( 'Enter the code from that page here: ', function( code ) {
      rl.close();
      oauth.getOAuthAccessToken( oAuthToken, oAuthTokenSecret, code, function( err, oAuthAccessToken, oAuthAccessTokenSecret, results) {
        if( err ) {
          console.error( 'Error getting oAuthAccessToken from Twitter: ' + err );
          return;
        }
        debug( 'results:', results );
        debug( 'oAuthAccessToken: ', oAuthAccessToken)
        debug( 'oAuthAccessTokenSecret: ', oAuthAccessTokenSecret)
        var token = {
          access_token_key:    oAuthAccessToken,
          access_token_secret: oAuthAccessTokenSecret
        }
        storeToken( token );
        callback( _.extend( credentials, token ) );
      });
    });
  })
}

function storeToken( token ) {
  fs.writeFile( './user_secret.json', JSON.stringify( token , null, 2 ), function( err ) {
    if( err ) throw err;
    console.log( 'The folling data has been saved to \'./user_secret.json\':' );
    console.log( JSON.stringify( token, null, 2 ) );
    console.log( 'If you are running dockerized, save this data outside the container then volume mount it on ./user_secret.json next time you use this docker image.' )
  });
}

function bootstrapAMQP( twitterTokens ) {
  amqp.connect( config.rabbitmq.url + '?heartbeat=60', function( err, conn ) {

    if( err ) {
      console.error( '[AMQP]', err.message );
      return setTimeout( function() { bootstrapAMQP( twitterTokens ); }, 1000 );
    }

    conn.on( 'error', function( err ) {
      if( err.message !== 'Connection closing' ) {
        console.error( '[AMQP] conn error' + err.message );
      }
    });

    conn.on( 'close', function() {
      console.error( '[AMQP] reconnecting...' );
      return setTimeout( function() { bootstrapAMQP( twitterTokens ); }, 1000 );
    });

    console.log( '[AMQP] connected' );

    start( conn, twitterTokens );

  });
}

function filter( arrayOfCaps ) {

  arrayOfCaps = _.map( arrayOfCaps, function( caps ) {
    _.each( config.filter, function( f ){
      var re = new RegExp( f.in, "g" );
      caps = caps.replace( re, f.out );
    })
    return caps;
  })
  debug( 'filter stage #1: ', arrayOfCaps );

  arrayOfCaps = _.filter( arrayOfCaps, function( caps ) {
    return caps;
  })
  debug( 'filter stage #2:', arrayOfCaps );

  return arrayOfCaps;
}

function start( amqpConn, twitterTokens ) {
  var twitter = new Twitter( twitterTokens );
  debug( 'twitterTokens: ', twitterTokens );
  debug( 'Twitter object: ', util.inspect( twitter ) );

  amqpConn.createChannel( function( err, ch ) {

    ch.assertExchange( config.rabbitmq.exchange, 'direct', { durable: true });

    ch.assertQueue( hostname, { durable: true }, function( err, q ) {
      console.log(' [*] Waiting for data. To exit press CTRL+C' );

      ch.bindQueue( q.queue, config.rabbitmq.exchange, config.rabbitmq.routein );
      ch.consume( q.queue, function( msg ) {
        var tweet = JSON.parse( msg.content.toString() );
        console.log( 'Got data : ', tweet.text );
        debug( 'Received a few data to tweet: ', tweet );
        var filtered = filter( tweet.filtered );

        _.each( filtered, function( f ) {
          twitter.post( 'statuses/update', { status: f }, function( err, tweet, response ) {
            if( err ) {
              console.error( 'Got an error while tweeting: ', util.inspect( err ) );
            }
            else {
              console.log( 'Twitted!' );
            }
          });
        });
      },
      {
        noAck: true
      });
    });
  });
}



