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
    sortDocsById,
    TestCase,
    TestDocument,
    TRANSACTION_SETTINGS
} from './helper';

export async function testCaseSortedReadWrite(): Promise<TestCase> {
    console.log('testCaseSortedReadWrite() START');

    const documentsAmount = 1000;

    const storeName = randomString(10);
    const testDocuments = new Array(documentsAmount)
        .fill(0)
        .map(() => getAverageDocument());

    const testCase: TestCase = {};

    /**
     * Open databases
     */
    let dbA: IDBDatabase;
    let dbB: IDBDatabase;
    testCase['open'] = {
        a: async () => {
            dbA = await openDatabase(
                randomString(10),
                [storeName]
            );
        },
        b: async () => {
            dbB = await openDatabase(
                randomString(10),
                [storeName]
            );
        }
    };

    /**
     * Insert documents
     */
    testCase['insert'] = {
        a: async () => {
            return insertMany(
                dbA,
                storeName,
                testDocuments
            );
        },
        b: async () => {
            return insertMany(
                dbB,
                storeName,
                sortDocsById(testDocuments)
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
                storeName
            );
        },
        b: async () => {
            return readAll(
                dbB,
                storeName
            );
        }
    };

    /**
     * Read documents by id
     */
    const halfDocIds: string[] = halfArray(testDocuments).map(d => d.id);
    testCase['read-by-id'] = {
        a: async () => {
            return findDocumentsById(
                dbA,
                storeName,
                halfDocIds
            );
        },
        b: async () => {
            return findDocumentsById(
                dbB,
                storeName,
                halfDocIds.sort()
            );
        }
    };

    testCase['cleanup'] = {
        a: async () => {
            return deleteDatabase(dbA);
        },
        b: async () => {
            return deleteDatabase(dbB);
        }
    };

    return testCase;
}


