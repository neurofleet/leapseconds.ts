"use strict";
(function (global) {
  var unix_ntp1900_offset = 2208988800000;
  var millisNowInit = Date.now();
  var performanceNowInit = Math.floor(performance.now());

  // NTP 1900 seconds, leap seconds, delta/day
  // src: https://maia.usno.navy.mil/ser7/tai-utc.dat
  // src: https://hpiers.obspm.fr/eop-pc/earthor/utc/TAI-UTC_tab.html
  var truth = [
    1924992000, 1.4228180, 0.0012960,
    1943308800, 1.6475700, 0.0012960,
    1956528000, 1.8458580, 0.0011232,
    2014329600, 2.6972788, 0.0011232,
    2019600000, 2.7657940, 0.0012960,
    2027462400, 2.9837300, 0.0012960,
    2040681600, 3.2820180, 0.0012960,
    2051222400, 3.5401300, 0.0012960,
    2056320000, 3.7165940, 0.0012960,
    2066860800, 3.9747060, 0.0012960,
    2072217600, 4.1550580, 0.0012960,
    2082758400, 4.3131700, 0.0025920,
    2148508800, 6.1856820, 0.0025920,
    2272060800, 10, 0,
    2287785600, 11, 0,
    2303683200, 12, 0,
    2335219200, 13, 0,
    2366755200, 14, 0,
    2398291200, 15, 0,
    2429913600, 16, 0,
    2461449600, 17, 0,
    2492985600, 18, 0,
    2524521600, 19, 0,
    2571782400, 20, 0,
    2603318400, 21, 0,
    2634854400, 22, 0,
    2698012800, 23, 0,
    2776982400, 24, 0,
    2840140800, 25, 0,
    2871676800, 26, 0,
    2918937600, 27, 0,
    2950473600, 28, 0,
    2982009600, 29, 0,
    3029443200, 30, 0,
    3076704000, 31, 0,
    3124137600, 32, 0,
    3345062400, 33, 0,
    3439756800, 34, 0,
    3550089600, 35, 0,
    3644697600, 36, 0,
    3692217600, 37, 0
  ];

  var atomicDay = 86400000;
  var atomicWeek = 7 * atomicDay;

  function unixToTAI1900(unixTime) {
    var ntpMillis = Math.floor(unixTime + unix_ntp1900_offset);
    var ntpSeconds = Math.floor(ntpMillis / 1000);
    for (var i = truth.length - 3; i >= 0; i -= 3) {
      if (ntpSeconds >= truth[i]) {
        var daysSinceChange = (ntpSeconds - truth[i]) / 86400;
        var deltaSeconds = truth[i + 1] + truth[i + 2] * daysSinceChange;
        var deltaMillis = Math.floor(deltaSeconds * 1000);
        return ntpMillis + deltaMillis;
      }
    }
    return ntpMillis;
  }

  var lsCache = unixToTAI1900(millisNowInit) - performanceNowInit;

  var TAI1900 = /** @class */ (function () {
    function TAI1900() {}
    TAI1900.fromUnix = function (unixTime) {
      return unixToTAI1900(unixTime);
    };
    TAI1900.now = function () {
      return Math.floor(performance.now() + lsCache);
    };
    return TAI1900;
  }());

  var gpsUnixZeroTAI1900 = 2524953619000;
  var GPStime = /** @class */ (function () {
    function GPStime() {}
    GPStime.fromTAI = function (taiTime) {
      return taiTime - gpsUnixZeroTAI1900;
    };
    GPStime.now = function () {
      return GPStime.fromTAI(TAI1900.now());
    };
    return GPStime;
  }());

  var api = {
    atomicDay: atomicDay,
    atomicWeek: atomicWeek,
    TAI1900: TAI1900,
    GPStime: GPStime
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.LeapSeconds = api;
}(typeof globalThis !== "undefined" ? globalThis : window));
