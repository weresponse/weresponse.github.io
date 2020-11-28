'use strict';

function signIn() {
  var provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider);
}

function signOut() {
  firebase.auth().signOut();
}

function initFirebaseAuth() {
  firebase.auth().onAuthStateChanged(authStateObserver);
}

function getProfilePicUrl() {
  return firebase.auth().currentUser.photoURL || '/images/profile_placeholder.png';
}

function getUserName() {
  return firebase.auth().currentUser.displayName;
}

function isUserSignedIn() {
  return !!firebase.auth().currentUser;
}


function saveMessage(messageText) {
  return firebase.firestore().collection('messages').add({
    name: getUserName(),
    text: messageText,
    profilePicUrl: getProfilePicUrl(),
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(function(error) {
    console.error('Error writing new message to database', error);
  });
}

function loadMessages() {
  var query = firebase.firestore()
                  .collection('messages')
                  .orderBy('timestamp', 'desc')
                  .limit(12);
  
  query.onSnapshot(function(snapshot) {
    snapshot.docChanges().forEach(function(change) {
      if (change.type === 'removed') {
        deleteMessage(change.doc.id);
      } else {
        var message = change.doc.data();
        displayMessage(change.doc.id, message.timestamp, message.name,
                       message.text, message.profilePicUrl, message.imageUrl);
      }
    });
  });
}

function saveImageMessage(file) {
  firebase.firestore().collection('messages').add({
    name: getUserName(),
    imageUrl: LOADING_IMAGE_URL,
    profilePicUrl: getProfilePicUrl(),
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  }).then(function(messageRef) {
    var filePath = firebase.auth().currentUser.uid + '/' + messageRef.id + '/' + file.name;
    return firebase.storage().ref(filePath).put(file).then(function(fileSnapshot) {
      return fileSnapshot.ref.getDownloadURL().then((url) => {
        return messageRef.update({
          imageUrl: url,
          storageUri: fileSnapshot.metadata.fullPath
        });
      });
    });
  }).catch(function(error) {
    console.error('There was an error uploading a file to Cloud Storage:', error);
  });
}

function saveMessagingDeviceToken() {
  firebase.messaging().getToken().then(function(currentToken) {
    if (currentToken) {
      console.log('Got FCM device token:', currentToken);
      firebase.firestore().collection('fcmTokens').doc(currentToken)
          .set({uid: firebase.auth().currentUser.uid});
    } else {
      requestNotificationsPermissions();
    }
  }).catch(function(error){
    console.error('Unable to get messaging token.', error);
  });
}

function requestNotificationsPermissions() {
  console.log('Requesting notifications permission...');
  firebase.messaging().requestPermission().then(function() {
    saveMessagingDeviceToken();
  }).catch(function(error) {
    console.error('Unable to get permission to notify.', error);
  });
}

function onMediaFileSelected(event) {
  event.preventDefault();
  var file = event.target.files[0];

  imageFormElement.reset();
  if (!file.type.match('image.*')) {
    var data = {
      message: 'You can only share images',
      timeout: 2000
    };
    signInSnackbarElement.MaterialSnackbar.showSnackbar(data);
    return;
  }
  if (checkSignedInWithMessage()) {
    saveImageMessage(file);
  }
}

function onMessageFormSubmit(e) {
  e.preventDefault();
  if (messageInputElement.value && checkSignedInWithMessage()) {
    saveMessage(messageInputElement.value).then(function() {
      resetMaterialTextfield(messageInputElement);
      toggleButton();
    });
  }
}

function authStateObserver(user) {
  if (user) { 
    var profilePicUrl = getProfilePicUrl();
    var userName = getUserName();

    userPicElement.style.backgroundImage = 'url(' + addSizeToGoogleProfilePic(profilePicUrl) + ')';
    userNameElement.textContent = userName;

    userNameElement.removeAttribute('hidden');
    userPicElement.removeAttribute('hidden');
    signOutButtonElement.removeAttribute('hidden');

    signInButtonElement.setAttribute('hidden', 'true');

    saveMessagingDeviceToken();
  } else { 
    userNameElement.setAttribute('hidden', 'true');
    userPicElement.setAttribute('hidden', 'true');
    signOutButtonElement.setAttribute('hidden', 'true');

    signInButtonElement.removeAttribute('hidden');
  }
}

function checkSignedInWithMessage() {
  if (isUserSignedIn()) {
    return true;
  }

  var data = {
    message: 'You must sign-in first',
    timeout: 2000
  };
  signInSnackbarElement.MaterialSnackbar.showSnackbar(data);
  return false;
}

function resetMaterialTextfield(element) {
  element.value = '';
  element.parentNode.MaterialTextfield.boundUpdateClassesHandler();
}

var MESSAGE_TEMPLATE =
    '<div class="message-container">' +
      '<div class="spacing"><div class="pic"></div></div>' +
      '<div class="message"></div>' +
      '<div class="name"></div>' +
    '</div>';

function addSizeToGoogleProfilePic(url) {
  if (url.indexOf('googleusercontent.com') !== -1 && url.indexOf('?') === -1) {
    return url + '?sz=150';
  }
  return url;
}

var LOADING_IMAGE_URL = 'https://www.google.com/images/spin-32.gif?a';

function deleteMessage(id) {
  var div = document.getElementById(id);
  if (div) {
    div.parentNode.removeChild(div);
  }
}

function createAndInsertMessage(id, timestamp) {
  const container = document.createElement('div');
  container.innerHTML = MESSAGE_TEMPLATE;
  const div = container.firstChild;
  div.setAttribute('id', id);

  timestamp = timestamp ? timestamp.toMillis() : Date.now();
  div.setAttribute('timestamp', timestamp);

  const existingMessages = messageListElement.children;
  if (existingMessages.length === 0) {
    messageListElement.appendChild(div);
  } else {
    let messageListNode = existingMessages[0];

    while (messageListNode) {
      const messageListNodeTime = messageListNode.getAttribute('timestamp');

      if (!messageListNodeTime) {
        throw new Error(
          `Child ${messageListNode.id} has no 'timestamp' attribute`
        );
      }

      if (messageListNodeTime > timestamp) {
        break;
      }

      messageListNode = messageListNode.nextSibling;
    }

    messageListElement.insertBefore(div, messageListNode);
  }

  return div;
}

function displayMessage(id, timestamp, name, text, picUrl, imageUrl) {
  var div = document.getElementById(id) || createAndInsertMessage(id, timestamp);

  if (picUrl) {
    div.querySelector('.pic').style.backgroundImage = 'url(' + addSizeToGoogleProfilePic(picUrl) + ')';
  }

  div.querySelector('.name').textContent = name;
  var messageElement = div.querySelector('.message');

  if (text) { 
    messageElement.textContent = text;
    messageElement.innerHTML = messageElement.innerHTML.replace(/\n/g, '<br>');
  } else if (imageUrl) { 
    var image = document.createElement('img');
    image.addEventListener('load', function() {
      messageListElement.scrollTop = messageListElement.scrollHeight;
    });
    image.src = imageUrl + '&' + new Date().getTime();
    messageElement.innerHTML = '';
    messageElement.appendChild(image);
  }
  setTimeout(function() {div.classList.add('visible')}, 1);
  messageListElement.scrollTop = messageListElement.scrollHeight;
  messageInputElement.focus();
}

function toggleButton() {
  if (messageInputElement.value) {
    submitButtonElement.removeAttribute('disabled');
  } else {
    submitButtonElement.setAttribute('disabled', 'true');
  }
}

function checkSetup() {
  if (!window.firebase || !(firebase.app instanceof Function) || !firebase.app().options) {
    window.alert('You have not configured and imported the Firebase SDK. ' +
        'Make sure you go through the codelab setup instructions and make ' +
        'sure you are running the codelab using `firebase serve`');
  }
}

checkSetup();

var messageListElement = document.getElementById('messages');
var messageFormElement = document.getElementById('message-form');
var messageInputElement = document.getElementById('message');
var submitButtonElement = document.getElementById('submit');
var imageButtonElement = document.getElementById('submitImage');
var imageFormElement = document.getElementById('image-form');
var mediaCaptureElement = document.getElementById('mediaCapture');
var userPicElement = document.getElementById('user-pic');
var userNameElement = document.getElementById('user-name');
var signInButtonElement = document.getElementById('sign-in');
var signOutButtonElement = document.getElementById('sign-out');
var signInSnackbarElement = document.getElementById('must-signin-snackbar');

messageFormElement.addEventListener('submit', onMessageFormSubmit);
signOutButtonElement.addEventListener('click', signOut);
signInButtonElement.addEventListener('click', signIn);

messageInputElement.addEventListener('keyup', toggleButton);
messageInputElement.addEventListener('change', toggleButton);

imageButtonElement.addEventListener('click', function(e) {
  e.preventDefault();
  mediaCaptureElement.click();
});
mediaCaptureElement.addEventListener('change', onMediaFileSelected);

initFirebaseAuth();

firebase.performance();

loadMessages();
