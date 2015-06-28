/*
 * View class represents a HTML component
 * Every view is an EventDispatcher.
 */
var Erizo = Erizo || {};
Erizo.View = function (spec) {
	"use strict";

    var that = Erizo.EventDispatcher({});

    // Variables

    // URL where it will look for icons and assets
    that.url = "https://10.0.0.8:8445/mpxweb";
    return that;
};