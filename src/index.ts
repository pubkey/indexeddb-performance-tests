import { runTestCase } from './helper';
import { testCasePerStore } from './test-case-per-store';
import { testCaseSharding } from './test-case-sharding';
import { testCaseDynamicStores } from './test-dynamic-stores';
import { testCaseSortedReadWrite } from './test-sorted-read-write';

(window as any).testCasePerStore = () => {
    runTestCase(
        testCasePerStore,
        10
    );
};


(window as any).testCaseDynamicStores = () => {
    runTestCase(
        testCaseDynamicStores,
        20
    );
};


(window as any).testCaseSharding = () => {
    runTestCase(
        testCaseSharding,
        20
    );
};

(window as any).testCaseSortedReadWrite = () => {
    runTestCase(
        testCaseSortedReadWrite,
        100
    );
};

