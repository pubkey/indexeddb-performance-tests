import { runTestCase } from './helper';
import { testCasePerStore } from './test-case-per-store';
import { testCaseSharding } from './test-case-sharding';

(window as any).testCasePerStore = () => {
    runTestCase(
        testCasePerStore,
        10
    );
};



(window as any).testCaseSharding = () => {
    runTestCase(
        testCaseSharding,
        10
    );
};
