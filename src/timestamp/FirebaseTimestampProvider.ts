import { TimestampProvider } from "./TimestampProvider";
import { Timestamp } from "firebase-admin/firestore";

export class FirebaseTimestampProvider implements TimestampProvider {
    public getTimestampSeconds(): number {
        return Timestamp.now().seconds;
    }
}
