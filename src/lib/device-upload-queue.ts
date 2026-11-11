// Explicitly enabled device storage. Blobs never leave the device until the user retries an upload.
const database='angaveritas-upload-recovery-v1'
async function open() {
  return new Promise<IDBDatabase>((resolve,reject)=>{
    const req=indexedDB.open(database,1)
    req.onupgradeneeded=()=>req.result.createObjectStore('queues')
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)
  })
}
export async function readUploadQueue<T>(key:string):Promise<T|null> {
  const db=await open()
  try{return await new Promise<T|null>((resolve,reject)=>{const req=db.transaction('queues').objectStore('queues').get(key);req.onsuccess=()=>resolve(req.result??null);req.onerror=()=>reject(req.error)})}finally{db.close()}
}
export async function saveUploadQueue(key:string,value:unknown|null) {
  const db=await open()
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('queues','readwrite');const store=tx.objectStore('queues');if(value===null)store.delete(key);else store.put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}finally{db.close()}
}
