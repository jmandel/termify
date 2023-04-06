## Using the HealthcareConceptChain

This tool uses the server's `$lookup-code` endpoint to obtain the appropriate medical terminology codes, plus some iterative prompting.


```sh
cd healthcare-concept-chain

export OPENAI_API_KEY=
npm run termify "patient has a left inguinal hernia. he needs to stop his coumadin before surgery"
```