import * as admin from "firebase-admin";
import ow from "ow";

import { FirestoreEquivalent } from "../types/FirestoreEquivalent";

import { PersistenceProvider } from "./PersistenceProvider";
import { PersistenceRecord } from "./PersistenceRecord";

export class FirestorePersistenceProvider implements PersistenceProvider {
    private firestore: admin.firestore.Firestore | FirestoreEquivalent;
    private debugFn: (msg: string) => void;
    private createExpireAtFromMillis: ((millis: number) => any) | undefined;

    /* istanbul ignore next (debugFn), because typescript injects if for default parameters */
    public constructor(
        firestore: FirestoreEquivalent,
        debugFn: (msg: string) => void = (msg: string) => {
            /* */
        }
    ) {
        this.firestore = firestore;
        ow(this.firestore, "firestore", ow.object);

        this.debugFn = debugFn;
    }

    public async updateAndGet(
        collectionName: string,
        recordName: string,
        updaterFn: (record: PersistenceRecord) => PersistenceRecord,
    ): Promise<PersistenceRecord> {
        let result: PersistenceRecord | undefined;
        const ref = this.getDocumentRef(collectionName, recordName);
        // Read and write through the transaction so concurrent calls cannot both pass the quota check.
        await this.firestore.runTransaction(async (transaction: any) => {
            const record = this.toRecord(await transaction.get(ref), collectionName, recordName);
            const updatedRecord = updaterFn(record);
            if (this.hasRecordChanged(record, updatedRecord)) {
                this.debugFn("Save record collection=" + collectionName + ", document=" + recordName);
                transaction.set(ref, this.toStoredRecord(updatedRecord));
            }
            result = updatedRecord;
        });
        /* istanbul ignore next */
        if (!result) throw new Error("FirestorePersistenceProvider: Persistence record could not be updated");
        return result;
    }

    public async get(collectionName: string, recordName: string): Promise<PersistenceRecord> {
        return await this.getRecord(collectionName, recordName);
    }

    public setDebugFn(debugFn: (msg: string) => void) {
        this.debugFn = debugFn;
    }

    public setCreateExpireAtFromMillis(createExpireAtFromMillis: (millis: number) => any) {
        this.createExpireAtFromMillis = createExpireAtFromMillis;
    }

    private async getRecord(collectionName: string, recordName: string): Promise<PersistenceRecord> {
        const docSnapshot = await this.getDocumentRef(collectionName, recordName).get();
        return this.toRecord(docSnapshot, collectionName, recordName);
    }

    private toRecord(
        docSnapshot: { exists: boolean; data(): object | undefined },
        collectionName: string,
        recordName: string,
    ): PersistenceRecord {
        this.debugFn("Got record from collection=" + collectionName + ", document=" + recordName);

        if (!docSnapshot.exists) return this.createEmptyRecord();

        const record: PersistenceRecord = docSnapshot.data() as PersistenceRecord;
        PersistenceRecord.validate(record);
        return record;
    }

    // One write: expireAt is stored in the form the TTL policy reads (or null without a converter).
    private toStoredRecord(record: PersistenceRecord): object {
        const expireAt = record.expireAt && this.createExpireAtFromMillis ?
            this.createExpireAtFromMillis(record.expireAt * 1000) :
            null;
        return { u: record.u, expireAt };
    }

    private getDocumentRef(
        collectionName: string,
        recordName: string,
    ): FirestoreEquivalent.DocumentReferenceEquivalent {
        return this.firestore.collection(collectionName).doc(recordName);
    }

    private createEmptyRecord(): PersistenceRecord {
        return {
            u: [],
            expireAt: null
        };
    }

    private hasRecordChanged(oldRecord: PersistenceRecord, newRecord: PersistenceRecord): boolean {
        if (oldRecord.u.length !== newRecord.u.length) {
            return true;
        } else {
            const a1 = oldRecord.u.concat().sort();
            const a2 = newRecord.u.concat().sort();
            for (let i = 0; i < a1.length; i++) {
                if (a1[i] !== a2[i]) return true;
            }
            return false;
        }
    }
}
