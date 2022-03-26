import { randomString } from 'async-test-util';
import { addStoresToExistingDatabase, deleteDatabase, findDocumentsById, getAverageDocument, insertMany, openDatabase, TestCase } from './helper';

export function testCaseDynamicStores(): TestCase {
    console.log('testCaseDynamicStores() START');

    const storeAmount = 10;
    const documentsPerStore = 1000;

    const storeNames = new Array(storeAmount)
        .fill(0)
        .map(() => randomString(10));
    const mainStoreName = 'documents';
    const withMainStore = storeNames.slice(0).concat([mainStoreName]);

    const testDoc = getAverageDocument();
    const testDocuments = new Array(documentsPerStore)
        .fill(0)
        .map(() => getAverageDocument());

    const testCase: TestCase = {};

    let dbA: IDBDatabase;
    const dbAName = randomString(10);
    let dbB: IDBDatabase;
    const dbBName = randomString(10);

    /**
     * First we insert a document so we can later
     * be sure that it was not lost during version changes.
     */
    testCase['open-insert-close'] = {
        a: async () => {
            dbA = await openDatabase(
                dbAName,
                [mainStoreName]
            );
            await insertMany(
                dbA,
                mainStoreName,
                [testDoc]
            );
            await dbA.close();
        },
        b: async () => {
            dbB = await openDatabase(
                dbBName,
                [mainStoreName]
            );
            await insertMany(
                dbB,
                mainStoreName,
                [testDoc]
            );
            await dbB.close();
        }
    };


    testCase['open-with-more-stores'] = {
        a: async () => {
            dbA = await openDatabase(
                dbAName,
                withMainStore
            );
            const foundAgain = await findDocumentsById(
                dbA,
                mainStoreName,
                [testDoc.id]
            );
            if (foundAgain[0].id !== testDoc.id) {
                throw new Error('A: did not found doc again');
            }
        },
        b: async () => {
            dbB = await openDatabase(
                dbBName,
                [mainStoreName]
            );

            /**
             * While adding more stores,
             * we first start a big write
             * to ensure we do not have to handle parallel stuff.
             * Do not await this call
             */
            // const insertPromise = insertMany(
            //     dbB,
            //     mainStoreName,
            //     testDocuments
            // );
            // awaitMe.push(insertPromise);

            dbB = await addStoresToExistingDatabase(
                dbB,
                storeNames
            );
            const foundAgain = await findDocumentsById(
                dbB,
                mainStoreName,
                [testDoc.id]
            );
            if (foundAgain[0].id !== testDoc.id) {
                throw new Error('B: did not found doc again');
            }
        }
    };



    testCase['cleanup'] = {
        a: async () => {
            return deleteDatabase(dbA);
        },
        b: async () => {
            await deleteDatabase(dbB);
        }
    };

    return testCase;
}
