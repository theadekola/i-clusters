// Only intentional user cancellation is quiet. Authentication and network failures stay visible.
export function isActionCancelled(error:unknown):boolean {
 const value=error as {code?:unknown;message?:unknown}|null;
 return value?.code==='ACTION_CANCELLED'||value?.message==='Authentication cancelled'||value?.message==='Confirmation cancelled';
}
