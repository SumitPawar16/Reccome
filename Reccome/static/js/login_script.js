/* =========================================
   1. BACKGROUND & UTILS (Shared)
   ========================================= */
// ✅ CHANGE: Paths update kiye hain taaki Flask unhe dhoondh sake
const images = [
  "/static/images/bg1.jpg", 
  "/static/images/bg2.jpg", 
  "/static/images/bg3.jpg", 
  "/static/images/bg4.jpg"
];

const imageSection = document.querySelector(".image-section");
if (imageSection) {
  const randomImage = images[Math.floor(Math.random() * images.length)];
  imageSection.style.backgroundImage = `url(${randomImage})`;
}

function togglePassword(fieldId, icon) {
  const input = document.getElementById(fieldId);
  if (input.type === "password") {
    input.type = "text";
    icon.classList.remove("fa-eye-slash");
    icon.classList.add("fa-eye");
  } else {
    input.type = "password";
    icon.classList.remove("fa-eye");
    icon.classList.add("fa-eye-slash");
  }
}

function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

/* =========================================
   2. LOGIN SPECIFIC LOGIC
   ========================================= */
function validateLogin() {
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;
  const errorMsg = document.getElementById("loginError");

  errorMsg.innerText = "";

  if (!email || !isValidEmail(email)) {
    errorMsg.innerText = "Please enter a valid email address.";
    return false; // ❌ Form submit hone se rok dega
  }
  if (!password || password.length < 8) {
    errorMsg.innerText = "Password must be at least 8 characters.";
    return false; // ❌ Form submit hone se rok dega
  }

  // ✅ Sab sahi hai, toh "true" return karega aur Form submit ho jayega
  return true;
}