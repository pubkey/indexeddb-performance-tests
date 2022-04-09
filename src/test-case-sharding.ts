import { randomString } from 'async-test-util';
import {
    addStoresToExistingDatabase,
    deleteDatabase,
    findDocumentsById,
    findViaBatchedCursor,
    findViaBatchedCursorCustomIndex,
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
    const shards = 10;
    const documents = 40000;

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
    const testCaseCommentedOut: TestCase = {};

    /**
     * Open databases
     */
    let dbA: IDBDatabase;
    let dbB: IDBDatabase;
    let dbsC: IDBDatabase[];
    let dbD: IDBDatabase;
    const dbNameE = randomString(10);
    let dbsE: IDBDatabase[];
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
        },
        e: async () => {
            dbsE = await Promise.all(
                storeNames.map((storeName) => openDatabase(
                    dbNameE,
                    [storeName]
                ))
            );
        },
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
        e: async () => {
            await Promise.all(
                storeNames.map((storeName, idx) => {
                    const docs = docsByShardKey.get(idx);
                    return insertMany(
                        dbsE[idx],
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
    testCaseCommentedOut['read'] = {
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
        e: async () => {
            let res: TestDocument[] = [];
            await Promise.all(
                storeNames.map((storeName, idx) => {
                    return readAll(
                        dbsE[idx],
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
    testCaseCommentedOut['read-by-id'] = {
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
        },
        e: async () => {
            return Promise.all(
                storeNames.map((storeName, idx) => {
                    const ids = getFromHalfDocByShardingKey(idx);
                    if (ids.length > 0) {
                        return findDocumentsById(
                            dbsE[idx],
                            storeName,
                            getFromHalfDocByShardingKey(idx)
                        );
                    } else {
                        return [];
                    }
                })
            );
        },
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
        },
        e: async () => {
            let res: TestDocument[] = [];
            await Promise.all(
                storeNames.map((storeName, idx) => {
                    return findViaCursor(
                        dbsE[idx],
                        storeName,
                        quarterDocsMaxAge
                    ).then(subRes => res = res.concat(subRes));
                })
            );
            ensureResultIsCorrect(res);
        },
    };


    const batchSize = 10;
    [
        batchSize * 1,
        //batchSize * 2,
        //batchSize * 3,
        //batchSize * 4,
        batchSize * 5,
        batchSize * 1000
    ].forEach(size => {
        testCase['read-by-batched-cursor-' + size] = {
            a: async () => {
                const res = await findViaBatchedCursor(
                    dbA,
                    'documents',
                    size,
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
                            size,
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
                            size,
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
                            size,
                            quarterDocsMaxAge
                        ).then(subRes => res = res.concat(subRes));
                    })
                );
                ensureResultIsCorrect(res);
            },
            e: async () => {
                let res: TestDocument[] = [];
                await Promise.all(
                    storeNames.map((storeName, idx) => {
                        return findViaBatchedCursor(
                            dbsE[idx],
                            storeName,
                            size,
                            quarterDocsMaxAge
                        ).then(subRes => res = res.concat(subRes));
                    })
                );
                ensureResultIsCorrect(res);
            },
        };
    });

    testCaseCommentedOut['read-by-batched-cursor-custom-index'] = {
        a: async () => {
            const res = await findViaBatchedCursorCustomIndex(
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
                    return findViaBatchedCursorCustomIndex(
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
                    return findViaBatchedCursorCustomIndex(
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
                    return findViaBatchedCursorCustomIndex(
                        dbD,
                        storeName,
                        batchSize,
                        quarterDocsMaxAge
                    ).then(subRes => res = res.concat(subRes));
                })
            );
            ensureResultIsCorrect(res);
        },
        e: async () => {
            let res: TestDocument[] = [];
            await Promise.all(
                storeNames.map((storeName, idx) => {
                    return findViaBatchedCursorCustomIndex(
                        dbsE[idx],
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
        },
        e: async () => {
            let res: TestDocument[] = [];
            await Promise.all(
                storeNames.map((storeName, idx) => {
                    return findViaGetAll(
                        dbsE[idx],
                        storeName,
                        quarterDocsMaxAge
                    ).then(subRes => res = res.concat(subRes));
                })
            );
            ensureResultIsCorrect(res);
        },
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
        },
        e: async () => {
            return Promise.all(
                dbsE.map(db => deleteDatabase(db))
            );
        }
    };

    return testCase;
}
