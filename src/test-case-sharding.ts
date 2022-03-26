import { randomString } from 'async-test-util';
import {
    addStoresToExistingDatabase,
    deleteDatabase,
    findDocumentsById,
    findViaCursor,
    getAverageDocument,
    getShardKey,
    halfArray,
    insertMany,
    openDatabase,
    readAll,
    TestCase,
    TestDocument,
    TRANSACTION_SETTINGS
} from './helper';

export async function testCaseSharding(): Promise<TestCase> {
    console.log('testCaseSharding() START');
    const shards = 5;
    const documents = 5000;

    const testDocuments = new Array(documents)
        .fill(0)
        .map(() => getAverageDocument());
    const storeNames = new Array(shards)
        .fill(0)
        .map(() => randomString(10));
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
    let dbD: IDBDatabase;
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
                storeNames
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
        },
        d: async () => {
            dbD = await openDatabase(
                randomString(10),
                []
            );
            dbD = await addStoresToExistingDatabase(
                dbD,
                storeNames
            );
        }
    };

    /**
     * Insert documents
     */
    testCase['insert'] = {
        a: async () => {
            await insertMany(
                dbA,
                'documents',
                testDocuments
            );
        },
        b: async () => {
            await Promise.all(
                storeNames.map((storeName, idx) => {
                    const docs = docsByShardKey.get(idx);
                    return insertMany(
                        dbB,
                        storeName,
                        docs
                    );
                })
            );
        },
        c: async () => {
            await Promise.all(
                dbsC.map((db, idx) => {
                    const docs = docsByShardKey.get(idx);
                    return insertMany(
                        db,
                        'documents',
                        docs
                    );
                })
            );
        },
        d: async () => {
            await Promise.all(
                storeNames.map((storeName, idx) => {
                    const docs = docsByShardKey.get(idx);
                    return insertMany(
                        dbD,
                        storeName,
                        docs
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
            return readAll(
                dbA,
                'documents'
            );
        },
        b: async () => {
            await Promise.all(
                storeNames.map(storeName => {
                    return readAll(
                        dbB,
                        storeName
                    );
                })
            );
        },
        c: async () => {
            await Promise.all(
                dbsC.map(db => {
                    return readAll(
                        db,
                        'documents'
                    );
                })
            );
        },
        d: async () => {
            await Promise.all(
                storeNames.map(storeName => {
                    return readAll(
                        dbD,
                        storeName
                    );
                })
            );
        },
    };


    /**
     * Read documents by id
     */
    const quarterDocIds: string[] = halfArray(halfArray(testDocuments)).map(d => d.id);
    function getFromHalfDocByShardingKey(shardKey: number) {
        return quarterDocIds.filter((docId) => {
            return getShardKey(
                shards,
                docId
            ) === shardKey;
        });
    }
    testCase['read-by-id'] = {
        a: async () => {
            return findDocumentsById(
                dbA,
                'documents',
                quarterDocIds
            );
        },
        b: async () => {
            return Promise.all(
                storeNames.map((storeName, idx) => {
                    return findDocumentsById(
                        dbB,
                        storeName,
                        getFromHalfDocByShardingKey(idx)
                    );
                })
            );
        },
        c: async () => {
            return Promise.all(
                dbsC.map((db, idx) => {
                    return findDocumentsById(
                        db,
                        'documents',
                        getFromHalfDocByShardingKey(idx)
                    );
                })
            );
        },
        d: async () => {
            await Promise.all(
                storeNames.map((storeName, idx) => {
                    return findDocumentsById(
                        dbD,
                        storeName,
                        getFromHalfDocByShardingKey(idx)
                    );
                })
            );
        }
    };


    const quarterDocsMaxAge = 25;
    let viaCursorAmount: number;
    testCase['read-by-cursor'] = {
        a: async () => {
            const res = await findViaCursor(
                dbA,
                'documents',
                quarterDocsMaxAge
            );
            if (!viaCursorAmount) {
                viaCursorAmount = res.length;
            } else if (viaCursorAmount !== res.length) {
                throw new Error('got wrong amount of documents');
            }
        },
        b: async () => {
            let res: TestDocument[] = [];
            await Promise.all(
                storeNames.map((storeName, idx) => {
                    return findViaCursor(
                        dbB,
                        storeName,
                        quarterDocsMaxAge
                    ).then(subRes => res = res.concat(subRes));
                })
            );
            if (!viaCursorAmount) {
                viaCursorAmount = res.length;
            } else if (viaCursorAmount !== res.length) {
                throw new Error('got wrong amount of documents');
            }
        },
        c: async () => {
            let res: TestDocument[] = [];
            await Promise.all(
                dbsC.map((db, idx) => {
                    return findViaCursor(
                        db,
                        'documents',
                        quarterDocsMaxAge
                    ).then(subRes => res = res.concat(subRes));
                })
            );
            if (!viaCursorAmount) {
                viaCursorAmount = res.length;
            } else if (viaCursorAmount !== res.length) {
                throw new Error('got wrong amount of documents');
            }
        },
        d: async () => {
            let res: TestDocument[] = [];
            await Promise.all(
                storeNames.map((storeName, idx) => {
                    return findViaCursor(
                        dbD,
                        storeName,
                        quarterDocsMaxAge
                    ).then(subRes => res = res.concat(subRes));
                })
            );
            if (!viaCursorAmount) {
                viaCursorAmount = res.length;
            } else if (viaCursorAmount !== res.length) {
                throw new Error('got wrong amount of documents');
            }
        }
    };


    testCase['cleanup'] = {
        a: async () => {
            return deleteDatabase(dbA);
        },
        b: async () => {
            return deleteDatabase(dbB);
        },
        c: async () => {
            return Promise.all(
                dbsC.map(db => deleteDatabase(db))
            );
        },
        d: async () => {
            return deleteDatabase(dbD);
        }
    };

    return testCase;
}
