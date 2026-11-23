export function storageUploadUrl(base:string,bucket:string,path:string,mysql:boolean):string {
 return mysql?`${base}/storage-upload?${new URLSearchParams({bucket,path})}`:`${base}/storage/v1/object/${bucket}/${path}`;
}
