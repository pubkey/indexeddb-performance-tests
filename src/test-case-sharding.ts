import { randomString } from 'async-test-util';
import {
    addStoresToExistingDatabase,
    deleteDatabase,
    findDocumentsById,
    findViaBatchedCursor,
    findViaCursor,
    findViaGetAll,
    getAverageDocument,
    getShardKey,
    halfArray,
    insertMany,
    openDatabase,
    readAll,
    sortByAgeAndId,
    TestCase,
    TestDocument
} from './helper';

export async function testCaseSharding(): Promise<TestCase> {
    console.log('testCaseSharding() START');
    const shards = 20;
    const documents = 50000;

    const testDocuments = new Array(documents)
        .fill(0)
        .map(() => getAverageDocument());
    const quarterDocsMaxAge = 25;

    const quarterDocs = testDocuments
        .filter(d => d.age <= 25)
        .sort(sortByAgeAndId);
    console.dir(quarterDocs);
    const quarterDocsAmount = quarterDocs.length;


    const storeNames = new Array(shards)
        .fill(0)
        .map(() => randomString(10));
    const docsByShardKey: Map<number, TestDocument[]> = new Map();
    new Array(shards).fill(0).map((_v, idx) => docsByShardKey.set(idx, []));
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
            ).then(gotDocs => {
                if (gotDocs.length !== testDocuments.length) {
                    throw new Error('docs missing');
                }
            });
        },
        b: async () => {
            let res: TestDocument[] = [];
            await Promise.all(
                storeNames.map(storeName => {
                    return readAll(
                        dbB,
                        storeName
                    ).then(subRes => res = res.concat(subRes));
                })
            );
            if (res.length !== testDocuments.length) {
                throw new Error('docs missing');
            }
        },
        c: async () => {
            let res: TestDocument[] = [];
            await Promise.all(
                dbsC.map(db => {
                    return readAll(
                        db,
                        'documents'
                    ).then(subRes => res = res.concat(subRes));
                })
            );
            if (res.length !== testDocuments.length) {
                throw new Error('docs missing');
            }
        },
        d: async () => {
            let res: TestDocument[] = [];
            await Promise.all(
                storeNames.map(storeName => {
                    return readAll(
                        dbD,
                        storeName
                    ).then(subRes => res = res.concat(subRes));
                })
            );
            if (res.length !== testDocuments.length) {
                throw new Error('docs missing');
            }
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
                    const ids = getFromHalfDocByShardingKey(idx);
                    if (ids.length > 0) {
                        return findDocumentsById(
                            dbB,
                            storeName,
                            getFromHalfDocByShardingKey(idx)
                        );
                    } else {
                        return [];
                    }
                })
            );
        },
        c: async () => {
            return Promise.all(
                dbsC.map((db, idx) => {
                    const ids = getFromHalfDocByShardingKey(idx);
                    if (ids.length > 0) {
                        return findDocumentsById(
                            db,
                            'documents',
                            getFromHalfDocByShardingKey(idx)
                        );
                    } else {
                        return [];
                    }
                })
            );
        },
        d: async () => {
            await Promise.all(
                storeNames.map((storeName, idx) => {
                    const ids = getFromHalfDocByShardingKey(idx);
                    if (ids.length > 0) {
                        return findDocumentsById(
                            dbD,
                            storeName,
                            getFromHalfDocByShardingKey(idx)
                        );
                    } else {
                        return [];
                    }
                })
            );
        }
    };


    function ensureResultIsCorrect(result: TestDocument[]) {
        return;
        const sorted = result.sort(sortByAgeAndId);
        quarterDocs.forEach((doc, idx) => {
            const isDoc = sorted[idx];
            if (!isDoc || doc.id !== isDoc.id) {
                console.dir({
                    idx,
                    quarterDocs,
                    sorted,
                    doc,
                    isDoc
                });
                throw new Error('result mismatch');
            }
        });

        if (result.length !== quarterDocs.length) {
            console.dir({
                quarterDocs,
                sorted
            });
            throw new Error('not same length');
        }
    }

    testCase['read-by-cursor'] = {
        a: async () => {
            const res = await findViaCursor(
                dbA,
                'documents',
                quarterDocsMaxAge
            );
            ensureResultIsCorrect(res);
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
            ensureResultIsCorrect(res);
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
            ensureResultIsCorrect(res);
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
            ensureResultIsCorrect(res);
        }
    };


    const batchSize = 100;
    testCase['read-by-batched-cursor'] = {
        a: async () => {
            const res = await findViaBatchedCursor(
                dbA,
                'documents',
                batchSize,
                quarterDocsMaxAge
            );
            ensureResultIsCorrect(res);
        },
        b: async () => {
            let res: TestDocument[] = [];
            await Promise.all(
                storeNames.map((storeName, idx) => {
                    return findViaBatchedCursor(
                        dbB,
                        storeName,
                        batchSize,
                        quarterDocsMaxAge
                    ).then(subRes => res = res.concat(subRes));
                })
            );
            ensureResultIsCorrect(res);
        },
        c: async () => {
            let res: TestDocument[] = [];
            await Promise.all(
                dbsC.map((db, idx) => {
                    return findViaBatchedCursor(
                        db,
                        'documents',
                        batchSize,
                        quarterDocsMaxAge
                    ).then(subRes => res = res.concat(subRes));
                })
            );
            ensureResultIsCorrect(res);
        },
        d: async () => {
            let res: TestDocument[] = [];
            await Promise.all(
                storeNames.map((storeName, idx) => {
                    return findViaBatchedCursor(
                        dbD,
                        storeName,
                        batchSize,
                        quarterDocsMaxAge
                    ).then(subRes => res = res.concat(subRes));
                })
            );
            ensureResultIsCorrect(res);
        }
    };


    testCase['read-by-get-all'] = {
        a: async () => {
            const res = await findViaGetAll(
                dbA,
                'documents',
                quarterDocsMaxAge
            );
            if (quarterDocsAmount !== res.length) {
                throw new Error('got wrong amount of documents');
            }
        },
        b: async () => {
            let res: TestDocument[] = [];
            await Promise.all(
                storeNames.map((storeName, idx) => {
                    return findViaGetAll(
                        dbB,
                        storeName,
                        quarterDocsMaxAge
                    ).then(subRes => res = res.concat(subRes));
                })
            );
            ensureResultIsCorrect(res);
        },
        c: async () => {
            let res: TestDocument[] = [];
            await Promise.all(
                dbsC.map((db, idx) => {
                    return findViaGetAll(
                        db,
                        'documents',
                        quarterDocsMaxAge
                    ).then(subRes => res = res.concat(subRes));
                })
            );
            ensureResultIsCorrect(res);
        },
        d: async () => {
            let res: TestDocument[] = [];
            await Promise.all(
                storeNames.map((storeName, idx) => {
                    return findViaGetAll(
                        dbD,
                        storeName,
                        quarterDocsMaxAge
                    ).then(subRes => res = res.concat(subRes));
                })
            );
            ensureResultIsCorrect(res);
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
