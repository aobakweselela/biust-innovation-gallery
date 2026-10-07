# aobakweselela-web-gallery

# BIUST Innovation Club — Onboarding Challenge

## 🖼️ Browser Gallery

Build a simple image gallery that works entirely in the browser.

### Requirements

* Allow users to **upload images** from their device.
* Store the uploaded images using **in-browser storage** such as IndexedDB or another suitable browser storage mechanism.
* Display the images in a clean gallery.
* Allow users to **view and delete** images.
* The gallery should still contain the images after refreshing the page.
* **No backend or external database is required.**
* Use any frontend framework or tools you are comfortable with.

### Deployment

Deploy your project to **Vercel** and include the live URL in your README.

### GitHub

Your repository should include:

* Source code
* A short README
* Instructions for running the project locally
* Live Vercel deployment link

### Bonus

Anything beyond the requirements is optional. For example:

* Image preview/fullscreen view
* Drag-and-drop uploads
* Image search or filtering
* Upload progress
* Multiple image selection
* Basic image metadata

### What We're Looking At

We are mainly interested in **how you approach the problem**, not how many features you add.

We'll look at:

* Code quality and organisation
* User experience
* How you handle browser storage
* Git/GitHub usage
* Problem-solving and initiative
* How well you can explain your implementation

**Keep it simple. Have fun building it.**
## Live Demo

https://YOUR-LIVE-URL.vercel.app

(Deployed on Vercel from github.com/aobakweselela/biust-innovation-gallery, a copy of this repo, because Vercel needed organisation-owner approval for the private repo.)

## How I approached it

- **Storage:** Images are saved as Blobs in IndexedDB together with their details (name, date, category, description). I chose IndexedDB over localStorage because localStorage only holds text and is limited to about 5 MB, so images would have to be converted to base64 and would take more space.
- **Flow:** On load the app reads everything from IndexedDB, then renders the gallery. Every action (upload, edit, delete, filter, search) updates the data and calls the same render function.
- **Save order:** The app writes to the database first and only then updates the screen, so the page never shows something that wasn't actually stored.
- **Error handling:** It checks the file type, rejects files over 8 MB, checks the image can be decoded, and shows a clear message if saving fails or storage is full.
- **Security:** User text is shown with textContent so it can't inject HTML.
- **Limits:** Photos stay in one browser on one device, and clearing site data removes them. I added export and import (a JSON backup) to work around this.
- **Next steps:** Resize large photos automatically, and add drag-and-drop and multi-upload.