// export async function getAIRecommendation(req, res, userPrompt, products) {
//   const API_KEY = process.env.GEMINI_API_KEY;
//   const URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${API_KEY}`;

//   try {
//     const geminiPrompt = `
//     Here is a list of available products:
//     ${JSON.stringify(products, null, 2)}

//     Based on the following user request, filter and sugggest the best matching products:"${userPrompt}"

//     Only return the matching in JSON format.
//     `;

//     const response = await fetch(URL, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         contents: [{ parts: [{ text: geminiPrompt }] }],
//       }),
//     });

//     const data = await response.json();
//     //console.log(data)
//     const aiResponseText =
//       data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

//     const cleanedText = aiResponseText
//       .replace(/```json/g, "")
//       .replace(/```/g, "")
//       .trim();

//     if (!cleanedText) {
//       return res
//         .status(500)
//         .json({ success: false, message: "AI response is empty or invalid." });
//     }

//     let parsedProducts;
//     try {
//       parsedProducts = JSON.parse(cleanedText);
//     } catch (error) {
//       return res
//         .status(500)
//         .json({ success: false, message: "Failed to parse AI response" });
//     }
//     return { success: true, products: parsedProducts };
//   } catch (error) {
//     res.status(500).json({ success: false, message: "Internal server error." });
//   }
// }

export async function getAIRecommendation(userPrompt, products) {
  const API_KEY = process.env.GEMINI_API_KEY;

  if (!API_KEY) {
    return {
      success: false,
      message: "GEMINI_API_KEY is not configured.",
    };
  }

  const URL =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

  try {
    const geminiPrompt = `
You are an AI product recommendation assistant.

Here is a list of available products:

${JSON.stringify(products, null, 2)}

Based on the following user request, filter and suggest the best matching products:

"${userPrompt}"

Rules:
1. Only select products from the provided product list.
2. Do not create or invent products.
3. Return only valid JSON.
4. Return a JSON array.
5. Do not include markdown or explanations.

Example:
[
  {
    "id": "product-id",
    "name": "Product Name"
  }
]
`;

    const response = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: geminiPrompt,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API Error:", data);

      return {
        success: false,
        message: data?.error?.message || "Gemini API request failed.",
      };
    }

    const aiResponseText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    if (!aiResponseText) {
      console.error("Empty Gemini response:", data);

      return {
        success: false,
        message: "AI response is empty or invalid.",
      };
    }

    console.log("Raw AI Response:", aiResponseText);

    const cleanedText = aiResponseText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    let parsedProducts;

    try {
      parsedProducts = JSON.parse(cleanedText);
    } catch (error) {
      console.error("JSON Parse Error:", error);
      console.error("AI Response:", cleanedText);

      return {
        success: false,
        message: "Failed to parse AI response as JSON.",
      };
    }

    if (!Array.isArray(parsedProducts)) {
      return {
        success: false,
        message: "AI returned an invalid product format.",
      };
    }

    return {
      success: true,
      products: parsedProducts,
    };
  } catch (error) {
    console.error("Gemini Request Error:", error);

    return {
      success: false,
      message: error.message || "Internal server error.",
    };
  }
}
