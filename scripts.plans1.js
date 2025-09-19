  // --- Your Firebase Config ---
        const FBCONFIG = {apiKey:"AIzaSyDPkUWIrsibI-hzKJ8ljhvawdJ9Nq4-cpE",authDomain:"checkmysteno.firebaseapp.com",projectId:"checkmysteno",storageBucket:"checkmysteno.firebasestorage.app",messagingSenderId:"719325115943",appId:"1:7193-d42a8002"};
        firebase.initializeApp(FBCONFIG);
        const DB = firebase.firestore();

        // --- GLOBAL CONFIGURATION ---
        const UPI_ID = "neha394@ybl";
        const PENDING_TICKET_KEY = 'stenoVerificationTicket';
        const PERSISTENT_ACCESS_CODE_KEY = 'stenoUserAccessCode';
        let statusCheckInterval = null;
        
        const paymentModal = document.getElementById('paymentModal');
        const termsModal = document.getElementById('termsModal');
        let currentStep = 1;
        let originalPrice = 0;
        let finalPrice = 0;
        let qrCodeInstance = null;

        document.addEventListener('DOMContentLoaded', () => {
            document.getElementById('upi-id-display').innerText = UPI_ID;
            
            fetchAndDisplayOffer();
            displayPersistentAccessCode();

            const ticketData = localStorage.getItem(PENDING_TICKET_KEY);
            if (ticketData) {
                const ticket = JSON.parse(ticketData);
                showStatusArea(ticket);
            } else {
                showMainContent();
            }
        });

        async function fetchAndDisplayOffer() {
            const offerBanner = document.getElementById('offer-banner');
            try {
                const configRef = DB.collection('siteConfig').doc('config');
                const configDoc = await configRef.get();

                if (configDoc.exists) {
                    const featuredCodeName = configDoc.data().featuredOfferCode;
                    
                    if (featuredCodeName) {
                        const offerRef = DB.collection('discountCodes').doc(featuredCodeName);
                        const offerDoc = await offerRef.get();

                        if (offerDoc.exists) {
                            const coupon = offerDoc.data();
                            if (coupon.isActive === true) {
                                const code = offerDoc.id;
                                const offerCodeDisplay = document.getElementById('offer-code-display');
                                const offerDescription = document.getElementById('offer-description');
                                const offerCodeBox = offerBanner.querySelector('.offer-code-box');
                                
                                offerCodeDisplay.textContent = code;
                                if (coupon.description) {
                                    offerDescription.textContent = coupon.description;
                                }
                                offerCodeBox.onclick = () => copyOfferCode(code, offerCodeBox);
                                offerBanner.classList.remove('hidden');
                            }
                        }
                    }
                }
            } catch (error) {
                console.error("Error fetching featured offer:", error);
                offerBanner.classList.add('hidden');
            }
        }

        function displayPersistentAccessCode() {
            const accessData = localStorage.getItem(PERSISTENT_ACCESS_CODE_KEY);
            if (accessData) {
                const { code } = JSON.parse(accessData);
                document.getElementById('persistent-code-display').textContent = code;
                document.getElementById('persistent-access-code-area').classList.remove('hidden');
            }
        }

        function copyPersistentCode(buttonElement) {
            const codeText = document.getElementById('persistent-code-display').innerText;
            navigator.clipboard.writeText(codeText).then(() => {
                const originalIcon = buttonElement.innerHTML;
                buttonElement.innerHTML = `<i class="fa-solid fa-check"></i>`;
                setTimeout(() => {
                    buttonElement.innerHTML = originalIcon;
                }, 2000);
            }).catch(err => { console.error('Failed to copy text: ', err); });
        }

        function dismissPersistentBanner() {
            localStorage.removeItem(PERSISTENT_ACCESS_CODE_KEY);
            document.getElementById('persistent-access-code-area').classList.add('hidden');
        }

        function showStatusArea(ticket) {
            document.getElementById('main-content').classList.add('hidden');
            document.getElementById('status-area').classList.remove('hidden');
            document.getElementById('pending-email').innerText = ticket.email;
            document.getElementById('pending-code').innerText = ticket.uniqueCode;
            checkVerificationStatus(ticket.uniqueCode);
            statusCheckInterval = setInterval(() => checkVerificationStatus(ticket.uniqueCode), 15000);
        }

        function showMainContent() {
            document.getElementById('main-content').classList.remove('hidden');
            document.getElementById('status-area').classList.add('hidden');
            if (statusCheckInterval) clearInterval(statusCheckInterval);
        }
        
        function startOver() {
            localStorage.removeItem(PENDING_TICKET_KEY);
            window.location.reload();
        }

        function cancelVerification() {
            if (confirm("Are you sure you want to cancel this verification process?")) {
                startOver();
            }
        }
        
        function copyOfferCode(code, element) {
            navigator.clipboard.writeText(code).then(() => {
                const originalContent = element.innerHTML;
                element.innerHTML = `<span>COPIED!</span> <i class="fa-solid fa-check"></i>`;
                element.style.borderColor = 'var(--success-color)';
                setTimeout(() => {
                    element.innerHTML = originalContent;
                    element.style.borderColor = 'var(--border-color)';
                }, 2500);
            }).catch(err => console.error('Failed to copy offer code: ', err));
        }

        async function checkVerificationStatus(uniqueCode) {
            const docRef = DB.collection('paymentVerifications').doc(uniqueCode);
            try {
                const doc = await docRef.get();
                if (!doc.exists) { return; }
                const docData = doc.data();
                if (docData.verified === true && docData.assignedAccessCode) {
                    clearInterval(statusCheckInterval);
                    const persistentData = { code: docData.assignedAccessCode, plan: docData.plan };
                    localStorage.setItem(PERSISTENT_ACCESS_CODE_KEY, JSON.stringify(persistentData));
                    
                    document.getElementById('pending-section').classList.add('hidden');
                    const successSection = document.getElementById('success-section');
                    document.getElementById('access-code-display').innerText = docData.assignedAccessCode;
                    
                    const planName = docData.plan;
                    const planValidityEl = document.getElementById('plan-validity');

                    if (planName.includes('SSC Steno Pass')) {
                        planValidityEl.innerText = 'Plan valid until your SSC Skill Test';
                    } else {
                        const planDuration = getPlanDurationInDays(planName);
                        if (docData.activationTimestamp && planDuration > 0) {
                            const activationDate = docData.activationTimestamp.toDate();
                            const expiryDate = new Date(activationDate);
                            expiryDate.setDate(activationDate.getDate() + planDuration);
                            planValidityEl.innerText = `Plan valid until: ${expiryDate.toLocaleDateString()}`;
                        }
                    }

                    successSection.classList.remove('hidden');
                    document.getElementById('access-code-reveal').onclick = () => {
                        navigator.clipboard.writeText(docData.assignedAccessCode).then(() => alert('Access Code copied!'));
                    };
                    localStorage.removeItem(PENDING_TICKET_KEY);
                } 
                else if (docData.verified === false) {
                    if ('rejectionReason' in docData) {
                        clearInterval(statusCheckInterval);
                        document.getElementById('pending-section').classList.add('hidden');
                        const rejectedSection = document.getElementById('rejected-section');
                        const reason = docData.rejectionReason || "Details provided did not match our records.";
                        document.getElementById('rejection-reason-text').innerText = reason;
                        rejectedSection.classList.remove('hidden');
                        localStorage.removeItem(PENDING_TICKET_KEY);
                    }
                }
            } catch (error) { console.error("Error checking verification status:", error); }
        }
        
        function getPlanDurationInDays(planName) {
            if (planName.includes('The Steno Pro Pass')) return 30;
            if (planName.includes('SSC Steno Pass')) return 3650;
            return 30;
        }

        function generateUniqueCode() {
            const prefix = "STENO";
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345679";
            let result = "";
            for (let i = 0; i < 4; i++) { result += chars.charAt(Math.floor(Math.random() * chars.length)); }
            return `${prefix}-${result}`;
        }
        
        function navigateToStep(stepNumber) {
            currentStep = stepNumber;
            document.querySelectorAll('.step').forEach((el, i) => el.classList.toggle('active', i + 1 === stepNumber));
            document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
            const contentId = `step-${stepNumber}-${stepNumber === 1 ? 'order' : stepNumber === 2 ? 'payment' : 'verify'}`;
            document.getElementById(contentId).classList.add('active');
            
            const actionButton = document.getElementById('modal-action-button');
            const backButton = document.getElementById('back-button');
            actionButton.disabled = false;
            backButton.classList.add('hidden');

            if (stepNumber === 1) {
                actionButton.textContent = "Proceed to Payment";
                actionButton.onclick = () => navigateToStep(2);
            } else if (stepNumber === 2) {
                actionButton.textContent = "Payment Done? Proceed to Verify";
                actionButton.onclick = () => navigateToStep(3);
                actionButton.disabled = !document.querySelector('.payment-option.selected');
            } else if (stepNumber === 3) {
                actionButton.textContent = "Verify My Payment";
                actionButton.onclick = () => document.getElementById('verifyForm').requestSubmit();
                backButton.classList.remove('hidden');
            }
        }

        document.querySelectorAll('.payment-option').forEach(option => {
            option.addEventListener('click', (e) => {
                if (e.target.closest('.copy-button')) return;
                document.querySelectorAll('.payment-option').forEach(el => el.classList.remove('selected'));
                const selectedOption = e.currentTarget;
                selectedOption.classList.add('selected');
                document.querySelectorAll('.payment-option-details').forEach(el => el.style.display = 'none');
                selectedOption.querySelector('.payment-option-details').style.display = 'block';
                if (selectedOption.id === 'qr-option' && !qrCodeInstance) { generateQRCode(); }
                document.getElementById('modal-action-button').disabled = false;
            });
        });

        function showPaymentModal(planName, planPrice) {
            originalPrice = planPrice;
            finalPrice = planPrice;
            document.getElementById('summary-plan-name').innerText = planName;
            document.getElementById('summary-total-price').innerText = `₹${finalPrice}`;
            const uniqueCode = generateUniqueCode();
            document.getElementById('unique-code-display-upi').innerText = uniqueCode;
            document.getElementById('unique-code-display-qr').innerText = uniqueCode;
            document.getElementById('planNameInput').value = planName;
            document.getElementById('planPriceInput').value = finalPrice;
            document.getElementById('uniqueCodeInput').value = uniqueCode;
            document.getElementById('coupon-code-input').value = '';
            document.getElementById('coupon-code-input').disabled = false;
            document.getElementById('apply-coupon-btn').disabled = false;
            document.getElementById('coupon-message').textContent = '';
            document.getElementById('discount-row').classList.add('hidden');
            document.getElementById('verifyForm').reset();
            qrCodeInstance = null;
            const qrContainer = document.getElementById('qr-code-container');
            if(qrContainer) qrContainer.innerHTML = '';
            document.querySelectorAll('.payment-option-details').forEach(el => el.style.display = 'none');
            document.querySelectorAll('.payment-option').forEach(el => el.classList.remove('selected'));
            navigateToStep(1);
            paymentModal.classList.add('visible');
        }

        function hidePaymentModal() { paymentModal.classList.remove('visible'); }
        function showTermsModal() { termsModal.classList.add('visible'); }
        function hideTermsModal() { termsModal.classList.remove('visible'); }
        
        function copyUniqueCode(elementId, buttonElement) {
            const codeText = document.getElementById(elementId).innerText;
            navigator.clipboard.writeText(codeText).then(() => {
                buttonElement.textContent = 'Copied!';
                setTimeout(() => { buttonElement.textContent = 'Copy'; }, 2000);
            }).catch(err => { console.error('Failed to copy text: ', err); });
        }

        function generateQRCode() {
            const qrContainer = document.getElementById('qr-code-container');
            if (!qrContainer) return;
            qrContainer.innerHTML = "";
            const uniqueCode = document.getElementById('uniqueCodeInput').value;
            const upiString = `upi://pay?pa=${UPI_ID}&pn=Check%20My%20Steno&am=${finalPrice}&cu=INR&tn=${uniqueCode}`;
            qrCodeInstance = new QRCode(qrContainer, { text: upiString, width: 130, height: 130, colorDark: "#0B1120", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });
        }

        async function applyCoupon() {
            const couponInput = document.getElementById('coupon-code-input');
            const applyBtn = document.getElementById('apply-coupon-btn');
            const messageEl = document.getElementById('coupon-message');
            const code = couponInput.value.trim().toUpperCase();
            if (!code) { messageEl.textContent = "Please enter a code."; messageEl.className = 'coupon-message-error'; return; }
            applyBtn.disabled = true;
            messageEl.textContent = "Checking...";
            messageEl.className = '';
            try {
                const docRef = DB.collection('discountCodes').doc(code);
                const doc = await docRef.get();
                if (doc.exists) {
                    const coupon = doc.data();
                    if (coupon.isActive) {
                        let discountAmount = 0;
                        if (coupon.type === 'percent') { discountAmount = (originalPrice * coupon.value) / 100; } 
                        else if (coupon.type === 'fixed') { discountAmount = coupon.value; }
                        finalPrice = Math.round(originalPrice - discountAmount);
                        if (finalPrice < 0) finalPrice = 0;
                        document.getElementById('summary-total-price').innerText = `₹${finalPrice}`;
                        document.getElementById('planPriceInput').value = finalPrice;
                        document.getElementById('summary-discount-amount').innerText = `- ₹${discountAmount.toFixed(2)}`;
                        document.getElementById('discount-row').classList.remove('hidden');
                        const description = coupon.description ? `<br><small>${coupon.description}</small>` : '';
                        messageEl.innerHTML = `Coupon applied successfully!${description}`;
                        messageEl.className = 'coupon-message-success';
                        couponInput.disabled = true;
                    } else {
                        messageEl.textContent = "This coupon has expired.";
                        messageEl.className = 'coupon-message-error';
                        applyBtn.disabled = false;
                    }
                } else {
                    messageEl.textContent = "Invalid coupon code.";
                    messageEl.className = 'coupon-message-error';
                    applyBtn.disabled = false;
                }
            } catch (error) {
                console.error("Error applying coupon: ", error);
                messageEl.textContent = "Could not verify coupon. Try again.";
                messageEl.className = 'coupon-message-error';
                applyBtn.disabled = false;
            }
        }

        async function submitVerification(event) {
            event.preventDefault();
            const submitBtn = document.getElementById('modal-action-button');
            const formMessage = document.getElementById('form-message');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Submitting...';
            
            const formData = {
                name: document.getElementById('userName').value,
                email: document.getElementById('userEmail').value,
                transactionId: document.getElementById('transactionId').value,
                plan: document.getElementById('planNameInput').value,
                price: document.getElementById('planPriceInput').value,
                uniqueCode: document.getElementById('uniqueCodeInput').value,
                appliedReferralCode: document.getElementById('referralCode').value.trim(),
                verified: false,
                submissionTimestamp: firebase.firestore.FieldValue.serverTimestamp()
            };

            try {
                await DB.collection('paymentVerifications').doc(formData.uniqueCode).set(formData);
                const ticket = { uniqueCode: formData.uniqueCode, email: formData.email };
                localStorage.setItem(PENDING_TICKET_KEY, JSON.stringify(ticket));
                hidePaymentModal();
                window.location.reload();
            } catch (error) {
                formMessage.textContent = 'Error. Please try again.';
                submitBtn.disabled = false;
                submitBtn.textContent = 'Verify My Payment';
                console.error("Firebase submission error:", error);
            }
        }
