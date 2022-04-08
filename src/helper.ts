import { randomBoolean, randomNumber, randomString, wait } from 'async-test-util';

export type TestDocument = {
    id: string;
    age: number;
    ageStringifiedCustomIndex: string;
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
    const age = randomNumber(0, 100);
    const ageStr = age + '';
    const id = randomString(12);
    return {
        id,
        /**
         * The age is normally distributed between 0 and 100.
         * It can be used to query for a subset of the documents.
         */
        age: age,
        /**
         * Instead of using IndexedDB compound indexes,
         * we can try crafting a custom string to use as iterable index.
         */
        ageStringifiedCustomIndex: ageStr.padStart(3, '0') + '|' + id,
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
    locale: null,

    unique: false
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
                    createDefaultIndexes(store);
                }
            });
        };
    });
}

export function createDefaultIndexes(
    store: IDBObjectStore
) {
    store.createIndex(
        'age-index',
        [
            'age',
            'id'
        ],
        indexSettings
    );
    store.createIndex(
        'custom-age-index',
        'ageStringifiedCustomIndex',
        indexSettings
    );
    store.createIndex(
        'bool-timestamp',
        [
            'bool',
            'timestamp',
        ],
        indexSettings
    );
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
            console.dir(event);
            rej(event);
        };
        openRequest.onsuccess = function (event) {
            res(openRequest.result);
        };

        /**
         * This can throw if a transaction was still
         * running while we upgraded the version.
         * In that case, we do not have to do anything
         * because onupgradeneeded will be called later anyway.
         */
        openRequest.onblocked = (err) => {
            console.log('addStoresToExistingDatabase() openRequest: blocked');
            console.dir(err);
            // rej('addStoresToExistingDatabase() openRequest: throw blocked');
        };
        openRequest.onupgradeneeded = function () {
            const newDatabase = openRequest.result;
            const openStores = newDatabase.objectStoreNames;
            const mustOpenStores = OPEN_STORES_BY_DATABASE_NAME.get(name);
            OPEN_STORES_BY_DATABASE_NAME.set(name, []);
            mustOpenStores.forEach(storeName => {
                if (!openStores.contains(storeName)) {
                    const store = newDatabase.createObjectStore(storeName, { keyPath: 'id' });
                    createDefaultIndexes(store);
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
    const totalResult: any = {};
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
                totalResult[metricKey] = {};
            }
            Object.entries(metric).forEach(([optionKey, timeValue]) => {
                if (!totalResult[metricKey][optionKey]) {
                    totalResult[metricKey][optionKey] = [];
                }
                console.dir(totalResult);
                totalResult[metricKey][optionKey].push(timeValue);
            });
        });
        console.log(JSON.stringify(result, null, 4));
    }

    // calculate average
    Object.entries(totalResult).forEach(([metricKey, metric]) => {
        Object.entries(metric).forEach(([optionKey]) => {
            const values: number[] = totalResult[metricKey][optionKey].sort((a, b) => a - b);

            /**
             * Remove lowest 10%
             * because browser can sometimes stuck when other tabs do things.
             */
            const tenPercent = Math.ceil(values.length / 10);
            const use = values.slice(0, values.length - tenPercent);
            const average = Math.ceil(sumOfArray(use) / use.length);

            totalResult[metricKey][optionKey] = average;
        });
        totalResult[metricKey] = sortObject(metric);
    });


    console.log('TOTAL RESULT:');
    console.log(JSON.stringify(totalResult, null, 4));

}


export function sumOfArray(ar: number[]): number {
    const sum = ar.reduce((a, b) => {
        return a + b;
    });
    return sum;
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
    const leftSide = ar.slice(0).splice(0, halfLength);
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
        tx.onerror = err => {
            // console.log('insertMany error:');
            // console.dir(err);
            rej(err);
        };
        tx.oncomplete = function (event) {
            // console.log('insertMany complete');
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


const adMe = 0.00000001;

export async function findViaCursor(
    db: IDBDatabase,
    storeName: string,
    maxAge: number
): Promise<TestDocument[]> {
    const result: TestDocument[] = [];
    return new Promise<TestDocument[]>((res, rej) => {
        const tx: IDBTransaction = (db as any)
            .transaction([storeName], 'readonly', TRANSACTION_SETTINGS);
        const store = tx.objectStore(storeName);

        const index = store.index('age-index');
        const range = IDBKeyRange.bound(
            [
                -Infinity,
                -Infinity
            ],
            [
                maxAge + adMe,
                Infinity
            ],
            false,
            false
        );
        const openCursorRequest = index.openCursor(range, 'next');
        openCursorRequest.onerror = err => rej(err);
        openCursorRequest.onsuccess = function (e: any) {
            const cursor = e.target.result;
            if (cursor) {
                result.push(cursor.value);
                cursor.continue();
            } else {
                // Iteration complete
                res(result);
            }
        };
    });
}


export async function findViaGetAll(
    db: IDBDatabase,
    storeName: string,
    maxAge: number
): Promise<TestDocument[]> {
    return new Promise<TestDocument[]>((res, rej) => {
        const tx: IDBTransaction = (db as any)
            .transaction([storeName], 'readonly', TRANSACTION_SETTINGS);
        const store = tx.objectStore(storeName);
        const index = store.index('age-index');
        const range = IDBKeyRange.bound(
            [
                -Infinity,
                -Infinity
            ],
            [
                maxAge + adMe,
                Infinity
            ],
            false,
            false
        );
        const openCursorRequest = index.getAll(range);
        openCursorRequest.onerror = err => rej(err);
        openCursorRequest.onsuccess = function (e: any) {
            res(e.target.result);
        };
    });
}

/**
 * @link https://nolanlawson.com/2021/08/22/speeding-up-indexeddb-reads-and-writes/
 * @link https://gist.github.com/inexorabletash/704e9688f99ac12dd336
 */
export async function findViaBatchedCursor(
    db: IDBDatabase,
    storeName: string,
    batchSize: number,
    maxAge: number
): Promise<TestDocument[]> {
    let result: TestDocument[] = [];
    const tx: IDBTransaction = (db as any)
        .transaction([storeName], 'readonly', TRANSACTION_SETTINGS);
    const store = tx.objectStore(storeName);
    const index = store.index('age-index');
    const maxString = String.fromCharCode(65535);

    let lastDoc: TestDocument | undefined;
    let done = false;
    while (done === false) {
        await new Promise<void>((res, rej) => {
            const range = IDBKeyRange.bound(
                [
                    lastDoc ? lastDoc.age : -Infinity,
                    lastDoc ? lastDoc.id : -Infinity,
                ],
                [
                    maxAge + adMe,
                    maxString
                ],
                true,
                false
            );
            const openCursorRequest = index.getAll(range, batchSize);
            openCursorRequest.onerror = err => rej(err);
            openCursorRequest.onsuccess = e => {
                const subResult: TestDocument[] = (e as any).target.result;
                lastDoc = lastOfArray(subResult);
                if (subResult.length === 0) {
                    done = true;
                } else {
                    result = result.concat(subResult);
                }
                res();
            };
        });
    }

    return result;
}

export async function findViaBatchedCursorCustomIndex(
    db: IDBDatabase,
    storeName: string,
    batchSize: number,
    maxAge: number
): Promise<TestDocument[]> {
    let result: TestDocument[] = [];
    const tx: IDBTransaction = (db as any)
        .transaction([storeName], 'readonly', TRANSACTION_SETTINGS);
    const store = tx.objectStore(storeName);
    const index = store.index('custom-age-index');


    const maxAgePlusOne = maxAge + 1;
    const maxAgeStr = ('' + maxAgePlusOne).padStart(3, '0');

    let lastDoc: TestDocument | undefined;
    let done = false;
    while (done === false) {
        await new Promise<void>((res, rej) => {
            const range = IDBKeyRange.bound(
                lastDoc ? lastDoc.ageStringifiedCustomIndex : -Infinity,
                maxAgeStr,
                true,
                false
            );
            const openCursorRequest = index.getAll(range, batchSize);
            openCursorRequest.onerror = err => rej(err);
            openCursorRequest.onsuccess = e => {
                const subResult: TestDocument[] = (e as any).target.result;
                lastDoc = lastOfArray(subResult);
                if (subResult.length === 0) {
                    done = true;
                } else {
                    result = result.concat(subResult);
                }
                res();
            };
        });
    }

    return result;
}


export function lastOfArray<T>(ar: T[]): T {
    return ar[ar.length - 1];
}


export function sortByAgeAndId(a: TestDocument, b: TestDocument): 1 | -1 {
    if (a.age > b.age) {
        return 1;
    } else if (a.age < b.age) {
        return -1;
    } else if (a.id > b.id) {
        return 1;
    } else {
        return -1;
    }
}
