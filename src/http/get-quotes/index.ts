import { stringify } from 'https://deno.land/std@0.84.0/node/querystring.ts';

const { CRON_TOKEN, FINNHUB_AUTH_TOKEN } = Deno.env.toObject();

/**
 * Base URL for the Finnhub API.
 */
const FINNHUB_API_BASE = 'https://finnhub.io/api/v1';

interface Request {
    headers: Headers;
    queryStringParameters: QueryParams;
}

/**
 * Mapping of HTTP headers.
 */
interface Headers {
    [key: string]: any;
}

/**
 * Object that details a support or resistance level with data on if and how it
 * was broken.
 */
interface LevelBreak {
    broke: boolean;
    resistance?: number;
    support?: number;
    closedBroken?: boolean;
}

/**
 * Mapping of query parameters.
 */
interface QueryParams {
    [key: string]: any;
}

/**
 * Mapping of all results returned by the API after having been parsed.
 */
interface ParsedResults {
    quotes: { [key: string]: any };
    supportResistance: number[];
}

/**
 * Handle the incoming request.
 *
 * @param request Request
 */
export async function handler(request: Request) {
    console.log(request);

    if (!CRON_TOKEN) {
        return {
            statusCode: 500,
            headers: {
                'content-type': 'text/plain; charset=utf8',
            },
            body: 'config not setup',
        };
    }

    if (!validateAuthorization(request.headers)) {
        return {
            statusCode: 401,
            headers: {
                'content-type': 'text/plain; charset=utf8',
            },
            body: 'unauthorized',
        };
    }

    let { resolution, symbol } = request.queryStringParameters;

    if (!symbol) {
        return {
            statusCode: 412,
            headers: {
                'content-type': 'text/plain; charset=utf8',
            },
            body: 'missing symbol',
        };
    }

    if (!resolution) {
        return {
            statusCode: 412,
            headers: {
                'content-type': 'text/plain; charset=utf8',
            },
            body: 'missing resolution',
        };
    }

    const symbols = [
        'AAPL',
        'AMD',
        'CRM',
        'MSFT',
        'NIO',
        'NVDA',
        'TSLA',
        'XPEV',
    ];

    const results = (
        await Promise.all(
            symbols.map(async (symbol) => {
                const results = await Promise.all([
                    fetchQuotes(symbol, 'D'),
                    fetchSupportResistance(symbol, 'D'),
                ]);

                const parsedResults = parseResults(results);
                const brokenLevels = determineLevelBreaks(parsedResults);

                return { symbol, brokenLevels };
            })
        )
    ).filter(({ brokenLevels }) => brokenLevels.length);

    return {
        statusCode: 200,
        headers: {
            'content-type': 'application/json; charset=utf8',
        },
        body: JSON.stringify(results),
    };
}

/**
 * Return a list of support/resistance levels that have been broken in the API
 * results data.
 *
 * @param results API results data
 */
function determineLevelBreaks(results: ParsedResults): LevelBreak[] {
    return results.supportResistance
        .map((level) => {
            const brokeSupport =
                results.quotes.o <= level && results.quotes.h >= level;
            const brokeResistance =
                results.quotes.o >= level && results.quotes.l <= level;

            if (brokeSupport) {
                return {
                    broke: true,
                    resistance: level,
                    closedBroken: results.quotes.c >= level,
                };
            }

            if (brokeResistance) {
                return {
                    broke: true,
                    support: level,
                    closedBroken: results.quotes.c <= level,
                };
            }

            return { broke: false };
        })
        .filter(({ broke }) => broke);
}

/**
 * Fetch quotes data for a symbol.
 *
 * @param symbol Symbol
 * @param resolution Resolution
 */
async function fetchQuotes(symbol: string, resolution: string) {
    const query = stringify({
        resolution,
        symbol,
    });
    const url = `${FINNHUB_API_BASE}/quote?${query}`;

    const response = await fetch(url, {
        headers: {
            'x-finnhub-token': FINNHUB_AUTH_TOKEN,
        },
    });

    return {
        data: await response.json(),
        result: 'quotes',
    };
}

/**
 * Fetch the support and resistance levels for a symbol.
 *
 * @param symbol Symbol
 * @param resolution Resolution
 */
async function fetchSupportResistance(symbol: string, resolution: string) {
    const query = stringify({
        resolution,
        symbol,
    });
    const url = `${FINNHUB_API_BASE}/scan/support-resistance?${query}`;

    const response = await fetch(url, {
        headers: {
            'x-finnhub-token': FINNHUB_AUTH_TOKEN,
        },
    });

    return {
        data: await response.json(),
        result: 'supportResistance',
    };
}

/**
 * Parse and cleanup the API results.
 *
 * @param results API results
 */
function parseResults(results: any[]): ParsedResults {
    const quotes = results.filter(({ result }) => result === 'quotes')[0];
    const supportResistance = results.filter(
        ({ result }) => result === 'supportResistance'
    )[0];

    return {
        quotes: { ...quotes.data },
        supportResistance: supportResistance.data.levels,
    };
}

/**
 * Validate the request by checking for the cron token in the headers.
 *
 * @param headers HTTP headers
 */
function validateAuthorization(headers: Headers) {
    const token = (headers['authorization'] || '').split(' ')[1];

    return token === CRON_TOKEN;
}
