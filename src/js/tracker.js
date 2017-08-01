/*
 * JavaScript tracker for Snowplow: tracker.js
 * 
 * Significant portions copyright 2010 Anthon Pang. Remainder copyright 
 * 2012-2014 Snowplow Analytics Ltd. All rights reserved. 
 * 
 * Redistribution and use in source and binary forms, with or without 
 * modification, are permitted provided that the following conditions are 
 * met: 
 *
 * * Redistributions of source code must retain the above copyright 
 *   notice, this list of conditions and the following disclaimer. 
 *
 * * Redistributions in binary form must reproduce the above copyright 
 *   notice, this list of conditions and the following disclaimer in the 
 *   documentation and/or other materials provided with the distribution. 
 *
 * * Neither the name of Anthon Pang nor Snowplow Analytics Ltd nor the
 *   names of their contributors may be used to endorse or promote products
 *   derived from this software without specific prior written permission. 
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS 
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT 
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR 
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT 
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, 
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT 
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, 
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY 
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT 
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE 
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

;(function() {

	var
		json2 = require('JSON'),
		sha1 = require('sha1'),
		requestQueue = require('./out_queue'),

		object = typeof exports !== 'undefined' ? exports : this; // For eventual node.js environment support


	object.Tracker = function Tracker(functionName, namespace, version, mutSnowplowState, argmap) {

		/************************************************************
		 * Private members
		 ************************************************************/
		var

			// Aliases
			documentAlias = document,
			windowAlias = window,
			navigatorAlias = navigator,

			customReferrer,

			argmap = argmap || {},

			// token if needed for post 
			configCollectorToken =  argmap.hasOwnProperty('token') ? argmap.token: '',
			// use secure credenmtials
			configUseSecureCredentials =  argmap.hasOwnProperty('useSecureCredentials') ? argmap.secureCredentials: false,

	
			// Snowplow collector URL
			configCollectorUrl,

		
			// Maximum delay to wait for web bug image to be fetched (in milliseconds)
			configTrackerPause = argmap.hasOwnProperty('pageUnloadTimer') ? argmap.pageUnloadTimer : 500,

			// Do Not Track browser feature
			dnt = navigatorAlias.doNotTrack || navigatorAlias.msDoNotTrack || windowAlias.doNotTrack,

			// Do Not Track
			configDoNotTrack = argmap.hasOwnProperty('respectDoNotTrack') ? argmap.respectDoNotTrack && (dnt === 'yes' || dnt === '1') : false,

			
			// This forces the tracker to be HTTPS even if the page is not secure
			forceSecureTracker = argmap.hasOwnProperty('forceSecureTracker') ? (argmap.forceSecureTracker === true) : false,

			// This forces the tracker to be HTTP even if the page is secure
			forceUnsecureTracker = !forceSecureTracker && argmap.hasOwnProperty('forceUnsecureTracker') ? (argmap.forceUnsecureTracker === true) : false,

			// Whether to use localStorage to store events between sessions while offline
			useLocalStorage = argmap.hasOwnProperty('useLocalStorage') ? argmap.useLocalStorage : true,

			
			// Last activity timestamp
			lastActivityTime,

			// The last time an event was fired on the page - used to invalidate session if cookies are disabled
			lastEventTime = new Date().getTime(),

			

			// Hash function
			hash = sha1,

		
			// Manager for local storage queue
			outQueueManager = new requestQueue.OutQueueManager(
				functionName,
				namespace,
				mutSnowplowState,
				useLocalStorage,
				argmap.bufferSize,
				argmap.maxPostBytes || 40000,
                                configUseSecureCredentials,
				configCollectorToken)

		

		

		/*
		 * Send request
		 */
		function sendRequest(request, delay) {
			var now = new Date();

			if (!configDoNotTrack) {
				outQueueManager.enqueueRequest(request, configCollectorUrl,configUseSecureCredentials,configCollectorToken);
				mutSnowplowState.expireDateTime = now.getTime() + delay;
			}
		}

		/**
		 * Adds the protocol in front of our collector URL, and i to the end
		 *
		 * @param string rawUrl The collector URL without protocol
		 *
		 * @return string collectorUrl The tracker URL with protocol
		 */
		function asCollectorUrl(rawUrl) {
			if (forceSecureTracker) {
				return ('https' + '://' + rawUrl);
			} 
			if (forceUnsecureTracker) {
				return ('http' + '://' + rawUrl);
			} 
			return ('https:' === documentAlias.location.protocol ? 'https' : 'http') + '://' + rawUrl;
		}



		/************************************************************
		 * Constructor
		 ************************************************************/

		/*
		 * Initialize tracker
		 */


		/************************************************************
		 * Public data and methods
		 ************************************************************/

		return {


			/**
			 * Prevent tracking if user's browser has Do Not Track feature enabled,
			 * where tracking is:
			 * 1) Sending events to a collector
			 * 2) Setting first-party cookies
			 * @param bool enable If true and Do Not Track feature enabled, don't track. 
			 */
			respectDoNotTrack: function (enable) {
				var dnt = navigatorAlias.doNotTrack || navigatorAlias.msDoNotTrack;

				configDoNotTrack = enable && (dnt === 'yes' || dnt === '1');
			},



			/**
			 * Frame buster
			 */
			killFrame: function () {
				if (windowAlias.location !== windowAlias.top.location) {
					windowAlias.top.location = windowAlias.location;
				}
			},

			/**
			 * Redirect if browsing offline (aka file: buster)
			 *
			 * @param string url Redirect to this URL
			 */
			redirectFile: function (url) {
				if (windowAlias.location.protocol === 'file:') {
					windowAlias.location = url;
				}
			},



			/**
			 * Send all events in the outQueue
			 * Use only when sending POSTs with a bufferSize of at least 2
			 */
			flushBuffer: function () {
				outQueueManager.executeQueue(configUseSecureCredentials,configCollectorToken);
			},



			/**
			 *
			 * Specify the Snowplow collector URL. No need to include HTTP
			 * or HTTPS - we will add this.
			 * 
			 * @param string rawUrl The collector URL minus protocol and /i
			 */
			setCollectorUrl: function (rawUrl) {
				configCollectorUrl = asCollectorUrl(rawUrl);
			},

			/**
			 * Track an unstructured event happening on this page.
			 *
			 * @param object eventJson Contains the properties and schema location for the event
			 */
			trackUnstructEvent: function (payload) {
				sendRequest(payload, configTrackerPause);
			},


	
		};
	};

}());
