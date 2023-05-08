function copyToClipboard() {
    // Get the text field
    var copyText = document.getElementById("email");
  
    let text = copyText.textContent;
    // Select the text field

  
     // Copy the text inside the text field
    navigator.clipboard.writeText(text);
  
    // Alert the copied text
    alert("The email has been copied to your clipboard.");
  }

  function randomReturn(){
    let x = Math.floor(Math.random() * 7);
    console.log(x)

    if(x==0){
      document.getElementById("programmingBtn").click();
    }
    else if(x==1){
      document.getElementById("gameBtn").click();
    }
    else if(x==2){
      document.getElementById("backgroundBtn").click();
    }
    else if(x==3){
      document.getElementById("coinBtn").click();
    }
    else if(x==4){
      document.getElementById("wusicBtn").click();
    }
    else if(x==5){
      document.getElementById("openglBtn").click();
    }
    else if(x==6){
      document.getElementById("betterUnityBtn").click();
    }
    else if(x==7){
      document.getElementById("shivaBtn").click();
    }
    
    
  }