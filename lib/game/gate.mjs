// Older cached clients check this endpoint before displaying the room list.
export function gate(){
 return Response.json({open:true},{headers:{'Cache-Control':'no-store'}});
}
