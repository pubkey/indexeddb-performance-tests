import { randomString, wait } from 'async-test-util';
import { getAverageDocument, halfArray, openDatabase, STORES_BY_DB, TestCase, TestDocument, TRANSACTION_SETTINGS } from './helper';

export async function testCasePerStore(): Promise<TestCase> {
    console.log('testCasePerStore() START');

    /**
     * 10 stores is about the average use case.
     */
    const storeAmount = 10;
    const documentsPerStore = 100;

    const testDocuments = new Array(documentsPerStore)
        .fill(0)
        .map(() => getAverageDocument());

    const testCase: TestCase = {};

    /**
     * Open databases
     */
    let dbA: any;
    let dbsB: any;
    testCase['open'] = {
        a: async () => {
            dbA = await openDatabase(
                randomString(10),
                new Array(storeAmount)
                    .fill(0)
                    .map(() => randomString(10))
            );
        },
        b: async () => {
            dbsB = await Promise.all(
                new Array(storeAmount)
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
            const stores = STORES_BY_DB.get(dbA);
            await Promise.all(
                stores.map(store => {
                    const tx: IDBTransaction = (dbA as any)
                        .transaction([store.name], 'readwrite', TRANSACTION_SETTINGS);

                    const innerStore = tx.objectStore(store.name);
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
                    if ((tx as any).commit) {
                        (tx as any).commit();
                    }
                    return Promise.all(callPromises);
                })
            );
        },
        b: async () => {
            await Promise.all(
                dbsB.map(db => {
                    const tx: IDBTransaction = (db as any)
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
                    if ((tx as any).commit) {
                        (tx as any).commit();
                    }
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
            const stores = STORES_BY_DB.get(dbA);
            await Promise.all(
                stores.map(store => {
                    const tx: IDBTransaction = (dbA as any)
                        .transaction([store.name], 'readonly', TRANSACTION_SETTINGS);
                    const innerStore = tx.objectStore(store.name);
                    return new Promise<any>(res => {
                        innerStore.getAll().onsuccess = function (event) {
                            res((event as any).target.result);
                        };
                        if ((tx as any).commit) {
                            (tx as any).commit();
                        }
                    });
                })
            );
        },
        b: async () => {
            await Promise.all(
                dbsB.map(db => {
                    const tx: IDBTransaction = (db as any)
                        .transaction(['documents'], 'readonly', TRANSACTION_SETTINGS);
                    const innerStore = tx.objectStore('documents');
                    return new Promise<any>(res => {
                        innerStore.getAll().onsuccess = function (event) {
                            res((event as any).target.result);
                        };
                        if ((tx as any).commit) {
                            (tx as any).commit();
                        }
                    });
                })
            );
        }
    };

    /**
     * Read documents by id
     */
    const halfDocs = halfArray(testDocuments);
    testCase['read-by-id'] = {
        a: async () => {
            const stores = STORES_BY_DB.get(dbA);
            await Promise.all(
                stores.map(store => {
                    const tx: IDBTransaction = (dbA as any)
                        .transaction([store.name], 'readonly', TRANSACTION_SETTINGS);
                    const innerStore = tx.objectStore(store.name);

                    return Promise.all(
                        halfDocs.map(doc => {
                            const docId = doc.id;
                            return new Promise<any>(res => {
                                const objectStoreRequest = innerStore.get(docId);
                                objectStoreRequest.onsuccess = function (event) {
                                    res({});
                                };
                            });
                        })
                    );
                })
            );
        },
        b: async () => {
            await Promise.all(
                dbsB.map(db => {
                    const tx: IDBTransaction = (db as any)
                        .transaction(['documents'], 'readonly', TRANSACTION_SETTINGS);
                    const innerStore = tx.objectStore('documents');
                    return Promise.all(
                        halfDocs.map(doc => {
                            const docId = doc.id;
                            return new Promise<any>(res => {
                                const objectStoreRequest = innerStore.get(docId);
                                objectStoreRequest.onsuccess = function (event) {
                                    res({});
                                };
                            });
                        })
                    );
                })
            );
        }
    };

    return testCase;
}


