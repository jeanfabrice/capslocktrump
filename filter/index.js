#!/usr/bin/env node
var amqp     = require('amqplib/callback_api');
var debug    = require( 'debug' )( 'filter' );
var util     = require( 'util' );
var _        = require( 'underscore' );
var hostname = require( 'os' ).hostname();
var config   = require( './config.json' );
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

function filter( msg ) {
  var result = [];
  var re = new RegExp( config.therealdonaldtrumpshoutingregexp, "g" );
  while( ( match = re.exec( msg ) ) !== null ){
    result.push( match[ 0 ] );
  }
  
  result = _.map( result, function( token ) {
    _.each( config.filter, function( f ){
      var re = new RegExp( f.in, "g" );
      token = token.replace( re, f.out );
    })
    return token;
  })
  result = _.filter( result, function( result ) {
    if( result !== '' ) return true;
  })

  debug( 'result:', result.join( "\n" ) );
  return result;
}


function start( amqpConn ) {
  amqpConn.createChannel( function( err, ch ) {

    ch.assertExchange( config.rabbitmq.exchange, 'direct', { durable: true });

    ch.assertQueue( hostname, { durable: true }, function( err, q ) {
      console.log(' [*] Waiting for data. To exit press CTRL+C' );
      ch.bindQueue( q.queue, config.rabbitmq.exchange, config.rabbitmq.routein );

      ch.consume( q.queue, function( msg ) {
        var tweet = JSON.parse( msg.content.toString() );
        debug( 'Received tweet text: ', tweet.text );
        var filtered = filter( tweet.text );
        debug( 'filtered: ', filtered );
        if( filtered.length ) {
          tweet.filtered = filtered;
          ch.publish( config.rabbitmq.exchange, config.rabbitmq.routeout, new Buffer( JSON.stringify( tweet ) ) );
        }
      },
      { 
        noAck: true
      });
    });
  });
}

bootstrapAMQP();