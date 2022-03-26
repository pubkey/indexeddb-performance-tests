import { randomBoolean, randomNumber, randomString, wait } from 'async-test-util';

export type TestDocument = {
    id: string;
    nr: number;
    timestamp: number;
    nes: {
        ted: {
            ob: {
                ject: string;
            }
        }
    },
    bool: boolean;
    longString: string;
    array: {
        s: string;
        n: number;
    }[];
};
export function getAverageDocument(): TestDocument {
    return {
        id: randomString(12),
        nr: randomNumber(0, 1000),
        timestamp: new Date().getTime(),
        nes: {
            ted: {
                ob: {
                    ject: randomString()
                }
            }
        },
        bool: randomBoolean(),
        longString: randomString(100),
        array: new Array(10).fill(0).map(() => ({
            s: randomString(4),
            n: randomNumber(0, 100)
        }))
    }
}

const indexSettings = {
    /**
     * We set local to null to ensure we have the same sorting as
     * when sorting in plain JavaScript.
     * > If no locale is specified, normal JavaScript sorting will be used — not locale-aware.
     * @link https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/createIndex
     */
    locale: null
} as any;

export const TRANSACTION_SETTINGS = { durability: 'relaxed' };

export const OPEN_STORES_BY_DATABASE_NAME: Map<string, string[]> = new Map();
export function addToOpenStoresMap(
    dbName: string,
    stores: string[]
) {
    let ar = OPEN_STORES_BY_DATABASE_NAME.get(dbName);
    if (!ar) {
        ar = [];
        OPEN_STORES_BY_DATABASE_NAME.set(dbName, ar);
    }
    stores.forEach(s => ar.push(s));
}

export function openDatabase(
    name: string,
    stores: string[]
): Promise<IDBDatabase> {
    addToOpenStoresMap(
        name,
        stores
    );
    return new Promise<IDBDatabase>((res, rej) => {
        /**
         * All IndexedDB databases are opened without version
         * because it is a bit faster, especially on firefox
         * @link http://nparashuram.com/IndexedDB/perf/#Open%20Database%20with%20version
         */
        const openRequest = indexedDB.open(name);
        openRequest.onerror = function (event) {
            rej(event);
        };
        openRequest.onsuccess = function (event) {
            res(openRequest.result);
        };

        openRequest.onupgradeneeded = function () {
            const database = openRequest.result;

            const openStores = database.objectStoreNames;
            const mustOpenStores = OPEN_STORES_BY_DATABASE_NAME.get(name);
            OPEN_STORES_BY_DATABASE_NAME.set(name, []);
            mustOpenStores.forEach(storeName => {
                if (!openStores.contains(storeName)) {
                    const store = database.createObjectStore(storeName, { keyPath: 'id' });
                    store.createIndex(
                        randomString(10),
                        [
                            'bool',
                            'timestamp',
                        ],
                        indexSettings
                    );
                }
            });
        };
    });
}


/**
 * For RxDB, we need to be able to dynamically add/remove stores
 * after the initial database creation.
 * @link https://stackoverflow.com/a/59004805/3443137
 * @link https://www.raymondcamden.com/2012/04/25/How-to-handle-setup-logic-with-indexedDB
 */
export async function addStoresToExistingDatabase(
    database: IDBDatabase,
    stores: string[]
): Promise<IDBDatabase> {
    const name = database.name;
    addToOpenStoresMap(name, stores);
    const previousVersion = database.version;

    database.close();
    return new Promise<IDBDatabase>((res, rej) => {
        const openRequest = indexedDB.open(name, previousVersion + 1);
        openRequest.onerror = function (event) {
            rej(event);
        };
        openRequest.onsuccess = function (event) {
            res(openRequest.result);
        };
        openRequest.onblocked = () => {
            rej('blocked');
        };
        openRequest.onupgradeneeded = function () {
            const newDatabase = openRequest.result;
            const openStores = newDatabase.objectStoreNames;
            const mustOpenStores = OPEN_STORES_BY_DATABASE_NAME.get(name);
            OPEN_STORES_BY_DATABASE_NAME.set(name, []);
            mustOpenStores.forEach(storeName => {
                if (!openStores.contains(storeName)) {
                    const store = newDatabase.createObjectStore(storeName, { keyPath: 'id' });
                    store.createIndex(
                        randomString(10),
                        [
                            'bool',
                            'timestamp',
                        ],
                        indexSettings
                    );
                }
            });
        };
    });
}

export async function getDatabaseVersion(name: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = event => {
            console.dir(event);

            const database = request.result;
            database.close();
            resolve(database.version);
        };
        request.onerror = event => reject((event as any).target.error);
        request.onblocked = event => reject(new Error('db is blocked'));
    });
}

export type TestCase = {
    [metric: string]: {
        [optionKey: string]: () => Promise<any>;
    }
};
export type TestResult = {
    [metric: string]: {
        [optionKey: string]: number;
    }
};

export async function runTestCase(
    testCaseFn: () => Promise<TestCase> | TestCase,
    runs: number
) {
    let done = 0;
    const totalResult: TestResult = {};
    const sleepInBetween = 1000;
    while (done < runs) {
        done++;
        const testCase = await testCaseFn();
        const result: TestResult = {};
        const metrics = Object.entries(testCase);
        for (const metric of metrics) {
            await wait(sleepInBetween);
            const metricKey = metric[0];
            result[metricKey] = {};
            const runFns = shuffleArray(Object.entries(metric[1]));
            for (const runFn of runFns) {
                const optionKey = runFn[0];
                console.log('run ' + metricKey + ': ' + optionKey);
                const fn = runFn[1];
                await wait(sleepInBetween);
                const startTime = performance.now();
                await fn();
                const endTime = performance.now() - startTime;
                result[metricKey][optionKey] = endTime;
                result[metricKey] = sortObject(result[metricKey]);
            }
        }

        // sum up results
        Object.entries(result).forEach(([metricKey, metric]) => {
            if (!totalResult[metricKey]) {
                totalResult[metricKey] = metric;
            } else {
                Object.entries(metric).forEach(([optionKey, timeValue]) => {
                    totalResult[metricKey][optionKey] = totalResult[metricKey][optionKey] + timeValue;
                });
            }
        });
        console.log(JSON.stringify(result, null, 4));
    }

    // calculate average
    Object.entries(totalResult).forEach(([metricKey, metric]) => {
        Object.entries(metric).forEach(([optionKey]) => {
            totalResult[metricKey][optionKey] = Math.ceil(totalResult[metricKey][optionKey] / runs);
        });
        totalResult[metricKey] = sortObject(metric);
    });


    console.log('TOTAL RESULT:');
    console.log(JSON.stringify(totalResult, null, 4));

}


/**
 * Shuffles array in place.
 * @link https://stackoverflow.com/a/6274381/3443137
 */
export function shuffleArray<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}


export function halfArray<T>(ar: T[]): T[] {
    const halfLength = Math.ceil(ar.length / 2);
    const leftSide = ar.splice(0, halfLength);
    return leftSide;
}


export function hashStringToNumber(str: string): number {
    let hash = 0, i, chr;
    if (str.length === 0) return hash;
    for (i = 0; i < str.length; i++) {
        chr = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }
    if (hash < 0) {
        hash = hash * -1;
    }
    return hash;
}


export function getShardKey(
    shards: number,
    documentId: string
): number {
    const hash = hashStringToNumber(documentId);
    return hash % shards;
}

export function sortObject<T>(obj: T): T {
    return Object.keys(obj).sort().reduce(function (result, key) {
        result[key] = obj[key];
        return result;
    }, {}) as any;
}


export async function insertMany(
    db: IDBDatabase,
    storeName: string,
    documents: TestDocument[]
): Promise<void> {
    const tx: IDBTransaction = (db as any)
        .transaction([storeName], 'readwrite', TRANSACTION_SETTINGS);
    const store = tx.objectStore(storeName);
    documents.forEach(doc => {
        store.put(doc);
    });
    if ((tx as any).commit) {
        (tx as any).commit();
    }
    return new Promise((res, rej) => {
        tx.onerror = err => rej(err);
        tx.oncomplete = function (event) {
            res();
        };
    });
}

export async function readAll(
    db: IDBDatabase,
    storeName: string
): Promise<TestDocument[]> {
    const tx: IDBTransaction = (db as any)
        .transaction([storeName], 'readonly', TRANSACTION_SETTINGS);
    const innerStore = tx.objectStore(storeName);
    return new Promise<any>(res => {
        innerStore.getAll().onsuccess = function (event) {
            res((event as any).target.result);
        };
    });
}

export async function deleteDatabase(
    database: IDBDatabase
): Promise<void> {
    /**
     * We first have to close the database
     * otherwise it cannot be deleted.
     */
    database.close();

    await new Promise<void>((res, rej) => {
        const deleteRequest = indexedDB.deleteDatabase(database.name);
        deleteRequest.onsuccess = function (event) {
            res();
        };
        deleteRequest.onerror = (ev) => {
            rej(ev);
        };
        deleteRequest.onblocked = function () {
            rej('Couldn\'t delete database due to the operation being blocked');
        };
    });
}


export async function findDocumentsById(
    db: IDBDatabase,
    storeName: string,
    docIds: string[]
): Promise<TestDocument[]> {
    const tx: IDBTransaction = (db as any)
        .transaction([storeName], 'readonly', TRANSACTION_SETTINGS);
    const innerStore = tx.objectStore(storeName);

    return Promise.all(
        docIds.map(docId => {
            return new Promise<any>(res => {
                const objectStoreRequest = innerStore.get(docId);
                objectStoreRequest.onsuccess = function (event) {
                    res(objectStoreRequest.result);
                };
            });
        })
    );
}
