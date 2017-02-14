#!/usr/bin/env node
var amqp    = require( 'amqplib/callback_api' );
var debug   = require( 'debug' )( 'file-reader' );
var util    = require( 'util' );
var _       = require( 'underscore' );
var config  = require( './config.json' );
var tweets  = require( './sampletweets.json' );
debug( 'config : ', config );


function bootstrapAMQP() {
  amqp.connect( config.rabbitmq.url + '?heartbeat=60', function( err, conn ) {

    if( err ) {
      console.error( '[AMQP]', err.message );
      return setTimeout( bootstrapAMQP, 1000 );
    }

    conn.on( 'error', function( err ) {
      if( err.message !== 'Connection closing' ) {
        console.error( '[AMQP] conn error', err.message );
      }
    });

    conn.on( 'close', function() {
      console.error( '[AMQP] reconnecting...' );
      return setTimeout( bootstrapAMQP, 1000 );
    });

    console.log( '[AMQP] connected' );

    start( conn );

  });
}

function start( amqpConn ) {

  amqpConn.createChannel( function( err, ch ) {

    ch.assertExchange( config.rabbitmq.exchange, 'direct', { durable: true });
    
    _.each( tweets, function ( e, i ) {
      debug( 'pushing tweets ID #'+i, e);
      console.log(' [*] publishing...')
      ch.publish( config.rabbitmq.exchange, config.rabbitmq.routeout, new Buffer( JSON.stringify( e ) ) );
    });

    setTimeout( start, 10000 );
  });
}



bootstrapAMQP();

