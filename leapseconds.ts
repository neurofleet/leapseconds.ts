const unix_ntp1900_offset =     2_208_988_800_000;

//let performanceNowOffset = 0;
const millisNowInit = Date.now();
const performanceNowInit = Math.floor(performance.now());

type milliseconds = number;


// NTP 1900 seconds,  leap seconds, delta/day
// src: https://maia.usno.navy.mil/ser7/tai-utc.dat
// src: https://hpiers.obspm.fr/eop-pc/earthor/utc/TAI-UTC_tab.html
// see: computed/tai_utc_mjd_expanded.csv for methodology
const truth = 
[
1924992000,  1.4228180,     0.0012960,// 1961 JAN  1 
1943308800,  1.6475700,     0.0012960,// 1961 AUG  1 
1956528000,  1.8458580,     0.0011232,// 1962 JAN  1 
2014329600,  2.6972788,     0.0011232,// 1963 NOV  1 
2019600000,  2.7657940,     0.0012960,// 1964 JAN  1 
2027462400,  2.9837300,     0.0012960,// 1964 APR  1 
2040681600,  3.2820180,     0.0012960,// 1964 SEP  1 
2051222400,  3.5401300,     0.0012960,// 1965 JAN  1 
2056320000,  3.7165940,     0.0012960,// 1965 MAR  1 
2066860800,  3.9747060,     0.0012960,// 1965 JUL  1 
2072217600,  4.1550580,     0.0012960,// 1965 SEP  1 
2082758400,  4.3131700,     0.0025920,// 1966 JAN  1 
2148508800,  6.1856820,     0.0025920,// 1968 FEB  1 
2272060800,         10,             0,//  # 1 Jan 1972
2287785600,         11,             0,//  # 1 Jul 1972
2303683200,         12,             0,//  # 1 Jan 1973
2335219200,         13,             0,//  # 1 Jan 1974
2366755200,         14,             0,//  # 1 Jan 1975
2398291200,         15,             0,//  # 1 Jan 1976
2429913600,         16,             0,//  # 1 Jan 1977
2461449600,         17,             0,//  # 1 Jan 1978
2492985600,         18,             0,//  # 1 Jan 1979
2524521600,         19,             0,//  # 1 Jan 1980
2571782400,         20,             0,//  # 1 Jul 1981
2603318400,         21,             0,//  # 1 Jul 1982
2634854400,         22,             0,//  # 1 Jul 1983
2698012800,         23,             0,//  # 1 Jul 1985
2776982400,         24,             0,//  # 1 Jan 1988
2840140800,         25,             0,//  # 1 Jan 1990
2871676800,         26,             0,//  # 1 Jan 1991
2918937600,         27,             0,//  # 1 Jul 1992
2950473600,         28,             0,//  # 1 Jul 1993
2982009600,         29,             0,//  # 1 Jul 1994
3029443200,         30,             0,//  # 1 Jan 1996
3076704000,         31,             0,//  # 1 Jul 1997
3124137600,         32,             0,//  # 1 Jan 1999
3345062400,         33,             0,//  # 1 Jan 2006
3439756800,         34,             0,//  # 1 Jan 2009
3550089600,         35,             0,//  # 1 Jul 2012
3644697600,         36,             0,//  # 1 Jul 2015
3692217600,         37,             0,//  # 1 Jan 2017
];

export const atomicDay: milliseconds = 86_400_000;
export const atomicWeek: milliseconds = 7 * atomicDay;


function unixToTAI1900(unixTime: milliseconds): milliseconds {
    const ntpMillis = Math.floor(unixTime + unix_ntp1900_offset);
    const ntpSeconds = Math.floor(ntpMillis / 1000);
    for(let i = truth.length-3; i >= 0; i-=3) {
        if(ntpSeconds >= truth[i]) {
            const daysSinceChange = (ntpSeconds - truth[i]) / 86_400;
            const deltaSeconds = truth[i+1] + truth[i+2]*daysSinceChange;
            const deltaMillis = Math.floor(deltaSeconds * 1000);

            return ntpMillis + deltaMillis;
        }
    }
    return ntpMillis;
}

const lsCache = unixToTAI1900(millisNowInit) - performanceNowInit;

type millisecondsTAI1900 = number;
export class TAI1900 {
    public static fromUnix(unixTime: milliseconds): millisecondsTAI1900 {
        return unixToTAI1900(unixTime);
    }
    public static now(): millisecondsTAI1900 {
        return Math.floor(performance.now() + lsCache);
    }
}

type millisecondsGPS = number;
//const gpsUnixZero = Date.parse("1980-01-06T00:00:00Z"); // todo:precompute
const gpsUnixZeroTAI1900 = 2524953619000 // = unixToTAI1900(gpsUnixZero); // todo:precompute
export class GPStime {
    static fromTAI(taiTime: millisecondsTAI1900): millisecondsGPS {
        return taiTime - gpsUnixZeroTAI1900;
    }
    static now(): millisecondsGPS {
        return GPStime.fromTAI(TAI1900.now());
    }
}
