
// Simulation script to verify the webhook logic purely for action -> URL mapping.
// Validates that correct URLs are assigned for specific actions.

const FIRST_PREVIEW_VIDEO_URL = "https://bhnsfqommnjziyhvzfli.supabase.co/storage/v1/object/public/media/previews/1764694671095_isiwgk.mp4";
const SHOWER_PHOTO_URL = "https://i.ibb.co/dwf177Kc/download.jpg";
const LINGERIE_PHOTO_URL = "https://i.ibb.co/dsx5mTXQ/3297651933149867831-62034582678-jpg.jpg";
const WET_FINGER_PHOTO_URL = "https://i.ibb.co/mrtfZbTb/fotos-de-bucetas-meladas-0.jpg";

function simulateHandler(action) {
    let mediaUrl, mediaType;
    let aiResponse = { action: action };

    if (aiResponse.action === 'send_shower_photo') {
        mediaUrl = SHOWER_PHOTO_URL;
        mediaType = 'image';
    }
    else if (aiResponse.action === 'send_lingerie_photo') {
        mediaUrl = LINGERIE_PHOTO_URL;
        mediaType = 'image';
    }
    else if (aiResponse.action === 'send_wet_finger_photo') {
        mediaUrl = WET_FINGER_PHOTO_URL;
        mediaType = 'image';
    }
    else if (aiResponse.action === 'send_video_preview') {
        mediaUrl = FIRST_PREVIEW_VIDEO_URL;
        mediaType = 'video';
    }

    return { mediaUrl, mediaType };
}

console.log("Testing Actions:");
const actions = ['send_shower_photo', 'send_lingerie_photo', 'send_wet_finger_photo', 'send_video_preview', 'none'];

actions.forEach(a => {
    const res = simulateHandler(a);
    console.log(`Action: ${a} -> URL: ${res.mediaUrl ? 'FOUND' : 'NULL'} (${res.mediaUrl || ''})`);
});
