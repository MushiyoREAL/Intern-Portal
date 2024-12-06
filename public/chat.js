document.addEventListener('DOMContentLoaded', function () {
    const appID = "266951b3dd7fc9ea";  // Replace with your App ID
    const region = "us";  // Replace with your region (e.g., us, in, etc.)
    const authKey = "9623f642a6c0c5b225650b7ee86dc2949065a1f1";  // Replace with your Auth Key

    // Initialize CometChat
    CometChat.init(appID, new CometChat.AppSettingsBuilder().subscribePresenceForAllUsers().setRegion(region).build()).then(
        () => {
            console.log("CometChat initialized successfully");
        },
        (error) => {
            console.log("CometChat initialization failed with error:", error);
        }
    );

    // Show the chat box when the "Start Chat" button is clicked
    document.getElementById("start-chat").addEventListener("click", function () {
        const user = { uid: "user-id", name: "User Name" };

        // Login the user
        CometChat.login(user.uid, authKey).then(
            (user) => {
                console.log("Logged in successfully:", user);
                document.getElementById("chat-box").style.display = "block";
                document.getElementById("start-chat").style.display = "none"; // Hide the start chat button
            },
            (error) => {
                console.log("Login failed with error:", error);
            }
        );
    });

    // Send message functionality
    const sendButton = document.getElementById("send-button");
    const messageInput = document.getElementById("message-input");

    sendButton.addEventListener("click", function () {
        const message = messageInput.value.trim();
        if (message) {
            // Create a text message
            const textMessage = new CometChat.TextMessage(
                "receiver-uid",  // Replace with the recipient's UID
                message,
                CometChat.MESSAGE_TYPE.TEXT,
                CometChat.RECEIVER_TYPE.USER
            );

            // Send the message
            CometChat.sendMessage(textMessage).then(
                (message) => {
                    console.log("Message sent successfully:", message);
                    displayMessage(message);
                },
                (error) => {
                    console.log("Message sending failed with error:", error);
                }
            );

            messageInput.value = ''; // Clear the message input
        }
    });

    // Display message in the chat box
    function displayMessage(message) {
        const messageList = document.getElementById("message-list");
        const messageElement = document.createElement("li");
        messageElement.classList.add("message");
        
        const sender = document.createElement("span");
        sender.classList.add("sender");
        sender.textContent = message.sender.name + ": ";

        const text = document.createElement("span");
        text.textContent = message.text;

        messageElement.appendChild(sender);
        messageElement.appendChild(text);
        messageList.appendChild(messageElement);
        
        // Scroll to the latest message
        messageList.scrollTop = messageList.scrollHeight;
    }

    // Enable the send button when the user types in the input
    messageInput.addEventListener("input", function () {
        if (messageInput.value.trim() !== "") {
            sendButton.disabled = false;
        } else {
            sendButton.disabled = true;
        }
    });
});
