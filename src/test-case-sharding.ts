import { randomString, wait } from 'async-test-util';
import { getAverageDocument, getShardKey, openDatabase, STORES_BY_DB, TestCase, TestDocument, TRANSACTION_SETTINGS } from './helper';

export async function testCaseSharding(): Promise<TestCase> {
    console.log('testCaseSharding() START');

    const testDocuments = new Array(50000)
        .fill(0)
        .map(() => getAverageDocument());
    const shards = 500;
    const docsByShardKey: Map<number, TestDocument[]> = new Map();
    testDocuments.forEach(testDoc => {
        const shardKey = getShardKey(
            shards,
            testDoc.id
        );
        let ar = docsByShardKey.get(shardKey);
        if (!ar) {
            ar = [];
            docsByShardKey.set(shardKey, ar);
        }
        ar.push(testDoc);
    });

    const testCase: TestCase = {};

    /**
     * Open databases
     */
    let dbA: IDBDatabase;
    let dbB: IDBDatabase;
    let dbsC: IDBDatabase[];
    testCase['open'] = {
        a: async () => {
            dbA = await openDatabase(
                randomString(10),
                ['documents']
            );
        },
        b: async () => {
            dbB = await openDatabase(
                randomString(10),
                new Array(shards)
                    .fill(0)
                    .map((_v, idx) => 'shard-' + idx)
            );
        },
        c: async () => {
            dbsC = await Promise.all(
                new Array(shards)
                    .fill(0)
                    .map(() => openDatabase(
                        randomString(10),
                        ['documents']
                    ))
            );
        }
    };

    /**
     * Insert documents
     */
    testCase['insert'] = {
        a: async () => {
            const tx: IDBTransaction = (dbA as any)
                .transaction(['documents'], 'readwrite', TRANSACTION_SETTINGS);
            const innerStore = tx.objectStore('documents');
            const callPromises: Promise<any>[] = [];
            testDocuments.forEach(doc => {
                const putCall = innerStore.put(doc);
                callPromises.push(
                    new Promise<any>(res => {
                        putCall.onsuccess = () => {
                            res({});
                        };
                    })
                );
            });
        },
        b: async () => {
            const stores = STORES_BY_DB.get(dbB);
            await Promise.all(
                stores.map((store, idx) => {
                    const docs = docsByShardKey.get(idx);
                    const tx: IDBTransaction = (dbB as any)
                        .transaction([store.name], 'readwrite', TRANSACTION_SETTINGS);
                    const innerStore = tx.objectStore(store.name);
                    const callPromises: Promise<any>[] = [];
                    docs.forEach(doc => {
                        const putCall = innerStore.put(doc);
                        callPromises.push(
                            new Promise<any>(res => {
                                putCall.onsuccess = () => {
                                    res({});
                                };
                            })
                        );
                    });
                    return Promise.all(callPromises);
                })
            );
        },
        c: async () => {
            await Promise.all(
                dbsC.map((db, idx) => {
                    const docs = docsByShardKey.get(idx);
                    const tx: IDBTransaction = (db as any)
                        .transaction(['documents'], 'readwrite', TRANSACTION_SETTINGS);
                    const innerStore = tx.objectStore('documents');
                    const callPromises: Promise<any>[] = [];
                    docs.forEach(doc => {
                        const putCall = innerStore.put(doc);
                        callPromises.push(
                            new Promise<any>(res => {
                                putCall.onsuccess = () => {
                                    res({});
                                };
                            })
                        );
                    });
                    return Promise.all(callPromises);
                })
            );
        }
    };

    /**
     * Read documents
     */
    testCase['read'] = {
        a: async () => {
            const tx: IDBTransaction = (dbA as any)
                .transaction(['documents'], 'readonly', TRANSACTION_SETTINGS);
            const innerStore = tx.objectStore('documents');
            return new Promise<any>(res => {
                innerStore.getAll().onsuccess = function (event) {
                    res((event as any).target.result);
                };
            });
        },
        b: async () => {
            const stores = STORES_BY_DB.get(dbB);
            await Promise.all(
                stores.map(store => {
                    const tx: IDBTransaction = (dbB as any)
                        .transaction([store.name], 'readonly', TRANSACTION_SETTINGS);
                    const innerStore = tx.objectStore(store.name);
                    return new Promise<any>(res => {
                        innerStore.getAll().onsuccess = function (event) {
                            res((event as any).target.result);
                        };
                    });
                })
            );
        },
        c: async () => {
            await Promise.all(
                dbsC.map(db => {
                    const tx: IDBTransaction = (db as any)
                        .transaction(['documents'], 'readonly', TRANSACTION_SETTINGS);
                    const innerStore = tx.objectStore('documents');
                    return new Promise<any>(res => {
                        innerStore.getAll().onsuccess = function (event) {
                            res((event as any).target.result);
                        };
                    });
                })
            );
        }
    };

    return testCase;
}
