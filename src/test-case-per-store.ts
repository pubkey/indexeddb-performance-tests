import { randomString, wait } from 'async-test-util';
import {
    addStoresToExistingDatabase,
    deleteDatabase,
    findDocumentsById,
    getAverageDocument,
    halfArray,
    insertMany,
    openDatabase,
    readAll,
    TestCase,
    TestDocument,
    TRANSACTION_SETTINGS
} from './helper';

export async function testCasePerStore(): Promise<TestCase> {
    console.log('testCasePerStore() START');

    /**
     * 10 stores is about the average use case.
     */
    const storeAmount = 10;
    const documentsPerStore = 1000;

    const storeNames = new Array(storeAmount)
        .fill(0)
        .map(() => randomString(10));
    const testDocuments = new Array(documentsPerStore)
        .fill(0)
        .map(() => getAverageDocument());

    const testCase: TestCase = {};

    /**
     * Open databases
     */
    let dbA: IDBDatabase;
    let dbsB: IDBDatabase[];
    let dbC: IDBDatabase;
    testCase['open'] = {
        a: async () => {
            dbA = await openDatabase(
                randomString(10),
                storeNames
            );
        },
        b: async () => {
            dbsB = await Promise.all(
                storeNames
                    .map(storeName => openDatabase(
                        storeName,
                        ['documents']
                    ))
            );
        },
        c: async () => {
            dbC = await openDatabase(
                randomString(10),
                []
            );
            dbC = await addStoresToExistingDatabase(
                dbC,
                storeNames
            );
        }
    };

    /**
     * Insert documents
     */
    testCase['insert'] = {
        a: async () => {
            await Promise.all(
                storeNames.map(storeName => {
                    return insertMany(
                        dbA,
                        storeName,
                        testDocuments
                    );
                })
            );
        },
        b: async () => {
            await Promise.all(
                dbsB.map(db => {
                    return insertMany(
                        db,
                        'documents',
                        testDocuments
                    );
                })
            );
        },
        c: async () => {
            await Promise.all(
                storeNames.map(storeName => {
                    return insertMany(
                        dbC,
                        storeName,
                        testDocuments
                    );
                })
            );
        },
    };

    /**
     * Read documents
     */
    testCase['read'] = {
        a: async () => {
            await Promise.all(
                storeNames.map(storeName => {
                    return readAll(
                        dbA,
                        storeName
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
        c: async () => {
            await Promise.all(
                storeNames.map(storeName => {
                    return readAll(
                        dbC,
                        storeName
                    );
                })
            );
        },
    };

    /**
     * Read documents by id
     */
    const halfDocIds: string[] = halfArray(testDocuments).map(d => d.id);
    testCase['read-by-id'] = {
        a: async () => {
            await Promise.all(
                storeNames.map(storeName => {
                    return findDocumentsById(
                        dbA,
                        storeName,
                        halfDocIds
                    );
                })
            );
        },
        b: async () => {
            await Promise.all(
                dbsB.map(db => {
                    return findDocumentsById(
                        db,
                        'documents',
                        halfDocIds
                    );
                })
            );
        },
        c: async () => {
            await Promise.all(
                storeNames.map(storeName => {
                    return findDocumentsById(
                        dbC,
                        storeName,
                        halfDocIds
                    );
                })
            );
        },
    };

    testCase['cleanup'] = {
        a: async () => {
            return deleteDatabase(dbA);
        },
        b: async () => {
            return Promise.all(
                dbsB.map(db => deleteDatabase(db))
            );
        },
        c: async () => {
            return deleteDatabase(dbC);
        }
    };

    return testCase;
}


