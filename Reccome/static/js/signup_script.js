/* =========================================
   1. BACKGROUND & UTILS (Shared)
   ========================================= */

// ✅ CHANGE: Paths ke aage "/static/" laga diya hai
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
   2. SIGNUP SPECIFIC LOGIC
   ========================================= */
function validateSignup(event) {
  // Agar HTML form use kar rahe hain, to default submit rokne ke liye:
  // (Lekin aapne button type="submit" rakha hai, toh ye validation HTML5 'required' ke sath chalega)
  
  const email = document.getElementById("signupEmail").value;
  const password = document.getElementById("signupPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;
  const errorMsg = document.getElementById("signupError");

  errorMsg.innerText = "";

  if (!email || !isValidEmail(email)) {
    errorMsg.innerText = "Please enter a valid email address.";
    return false; // Error hai
  }
  if (password.length < 8) {
    errorMsg.innerText = "Password must be at least 8 characters.";
    return false; // Error hai
  }
  if (password !== confirmPassword) {
    errorMsg.innerText = "Passwords do not match!";
    return false; // Error hai
  }

  // Agar sab sahi hai, toh form apne aap submit ho jayega (kyunki button type="submit" hai)
  // alert("Signup Successful! Proceeding..."); // Iski ab zaroorat nahi hai
  return true;
}